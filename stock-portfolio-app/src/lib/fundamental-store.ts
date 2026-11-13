import type { FundamentalSnapshot, StockFundamental } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { currencyOfMarket } from '@/lib/currency'
import { saveDailyCloses } from '@/lib/daily-price'
import { addDays, dateKeyOf, formatDateKey, toDateKey } from '@/lib/date-key'
import {
  checkFundamentals,
  type FundamentalCheck,
  type IndicatorValues,
} from '@/lib/fundamental-check'
import {
  computeFundamentalIndicators,
  computePriceStats,
  fetchAnnualFundamentalsSeries,
  fetchStockFundamentals,
  type AnnualFundamentals,
  type FundamentalIndicators,
} from '@/lib/fundamentals'
import { ETF_SECTOR } from '@/lib/sector'
import { judgeSellSignal, type SellPeriod, type SellSignal } from '@/lib/sell-signal'
import { getApiSymbol } from '@/lib/utils'

// 基準チェックの保存と読み出し（ADR 0021）。判定そのものは fundamental-check.ts。
//
//   - 財務の最新値（StockFundamental）：価格更新のついでに、無いか古ければ取り直す
//   - 購入時の指標（FundamentalSnapshot）：買いの取引を登録したときに作る。
//     作れなかった分は、次の価格更新で作り直す
//   - チェック開始日：基準チェックを始めた日。その日の保有に一括で購入時の指標を作り、
//     それより前の取引には個別に作らない
//
// 読み出し（loadFundamentalChecks）は画面の API と MCP サーバーが共用する。

// 財務の値は決算ごとにしか変わらないため、この日数より古ければ取り直す
export const FUNDAMENTAL_REFRESH_DAYS = 30

// チェック開始日を保存する Setting のキー。API から書き換えられないよう SETTING_KEYS には入れない
const CHECK_START_DATE_KEY = 'fundamentalCheckStartDate'

/**
 * 財務の値を取り直すか。
 *
 * storedPeriods は、その銘柄について保存済みの決算期の数。売りの判定（ADR 0023）は
 * 前の期と比べるため 2 期要る。期ごとの保存を始める前に取った銘柄は 1 期しか持たないので、
 * 取得日が新しくても取り直して過去の期を埋める。
 */
export function shouldRefreshFundamental(
  fetchedAt: Date | null,
  now: Date,
  storedPeriods: number,
): boolean {
  if (!fetchedAt) return true
  if (storedPeriods < 2) return true
  return now.getTime() - fetchedAt.getTime() >= FUNDAMENTAL_REFRESH_DAYS * 24 * 60 * 60 * 1000
}

const toNumber = (value: { toString(): string } | null): number | null =>
  value === null ? null : Number(value)

function annualOfRow(row: StockFundamental): AnnualFundamentals {
  return {
    fiscalPeriodEnd: formatDateKey(row.fiscalPeriodEnd),
    currency: row.currency,
    equity: toNumber(row.equity),
    totalAssets: toNumber(row.totalAssets),
    totalLiabilities: toNumber(row.totalLiabilities),
    totalDebt: toNumber(row.totalDebt),
    workingCapital: toNumber(row.workingCapital),
    retainedEarnings: toNumber(row.retainedEarnings),
    ebit: toNumber(row.ebit),
    revenue: toNumber(row.revenue),
    netIncome: toNumber(row.netIncome),
    freeCashFlow: toNumber(row.freeCashFlow),
    sharesOutstanding: toNumber(row.sharesOutstanding),
  }
}

// 'YYYY-MM-DD' を暦日キーにする（ADR 0012）
function dateKeyOfIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return dateKeyOf(y, m - 1, d)
}

// 通期決算を期ごとに保存する（銘柄 × 決算期で 1 行。ADR 0023）。
// 取り直したときは同じ期の行を上書きする（Yahoo が後から値を直すことがあるため）
async function saveFundamentals(stockId: number, series: AnnualFundamentals[]): Promise<void> {
  const fetchedAt = new Date()
  for (const annual of series) {
    const { fiscalPeriodEnd, currency, ...values } = annual
    const data = {
      ...values,
      fiscalPeriodEnd: dateKeyOfIso(fiscalPeriodEnd),
      currency,
      fetchedAt,
      source: 'yahoo',
    }
    await prisma.stockFundamental.upsert({
      where: { stockId_fiscalPeriodEnd: { stockId, fiscalPeriodEnd: data.fiscalPeriodEnd } },
      create: { stockId, ...data },
      update: data,
    })
  }
}

/**
 * 売りの判定（ADR 0023）に渡す期ごとの値。古い順に並べる。
 *
 * ROE・自己資本比率・有利子負債倍率は株価を使わないため、価格 0 で計算しても同じ値になる
 * （FCF利回りと Altman Z は時価総額を使うので null になるが、売りの判定では使わない）。
 * 指標の式を書き写さず computeFundamentalIndicators をそのまま使う。
 */
function sellPeriodsOf(rows: StockFundamental[], market: string): SellPeriod[] {
  return [...rows]
    .sort((a, b) => a.fiscalPeriodEnd.getTime() - b.fiscalPeriodEnd.getTime())
    .map((row) => {
      const indicators = computeFundamentalIndicators(annualOfRow(row), {
        price: 0,
        currency: currencyOfMarket(market),
      })
      return {
        fiscalPeriodEnd: formatDateKey(row.fiscalPeriodEnd),
        values: {
          roe: indicators.roe,
          equityRatio: indicators.equityRatio,
          debtToEquity: indicators.debtToEquity,
          negativeEquity: indicators.negativeEquity,
        },
      }
    })
}

/**
 * 財務の最新値が無いか古ければ、Yahoo から取り直して保存する。ETF は財務の値が無いので取らない。
 * 価格更新のついでに呼ばれるため、失敗しても例外を投げずにログだけ残す
 * （財務の値が取れないことを理由に価格更新を失敗扱いにしない）。
 */
export async function refreshFundamentalIfStale(stock: {
  id: number
  code: string
  marketSector: string | null
}): Promise<void> {
  if (stock.marketSector === ETF_SECTOR) return
  try {
    const [row, storedPeriods] = await Promise.all([
      prisma.stockFundamental.findFirst({
        where: { stockId: stock.id },
        orderBy: { fiscalPeriodEnd: 'desc' },
        select: { fetchedAt: true },
      }),
      prisma.stockFundamental.count({ where: { stockId: stock.id } }),
    ])
    if (!shouldRefreshFundamental(row?.fetchedAt ?? null, new Date(), storedPeriods)) return

    const series = await fetchAnnualFundamentalsSeries(getApiSymbol(stock.code))
    if (series.length > 0) await saveFundamentals(stock.id, series)
  } catch (error) {
    console.error(`Failed to refresh fundamentals for ${stock.code}:`, error)
  }
}

async function getCheckStartDate(): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key: CHECK_START_DATE_KEY } })
  return row ? dateKeyOfIso(row.value) : null
}

function snapshotValues(indicators: FundamentalIndicators | null) {
  return {
    roe: indicators?.roe ?? null,
    fcfYield: indicators?.fcfYield ?? null,
    equityRatio: indicators?.equityRatio ?? null,
    debtToEquity: indicators?.debtToEquity ?? null,
    altmanZ: indicators?.altmanZ ?? null,
    negativeEquity: indicators?.negativeEquity ?? false,
  }
}

/**
 * 購入時の指標を 1 件作る。Yahoo から財務の値と 2 年ぶんの終値を取り、
 * 指標は price（省略時は最新の終値）で計算する。ついでに財務の最新値と日次終値も保存する
 * （新しく買った銘柄の 200日線を、日次終値から計算できるようにするため）。
 */
async function createSnapshot(
  stock: { id: number; code: string },
  options: { transactionId: number | null; recordedOn: Date; price?: number; isCheckStart: boolean },
): Promise<void> {
  const fetched = await fetchStockFundamentals(stock.code)
  const price = options.price ?? fetched.price
  const indicators = fetched.annual
    ? computeFundamentalIndicators(fetched.annual, { price, currency: fetched.priceCurrency })
    : null

  await prisma.fundamentalSnapshot.create({
    data: {
      stockId: stock.id,
      transactionId: options.transactionId,
      recordedOn: options.recordedOn,
      isCheckStart: options.isCheckStart,
      price,
      fiscalPeriodEnd: fetched.annual ? dateKeyOfIso(fetched.annual.fiscalPeriodEnd) : null,
      movingAverage200: fetched.priceStats.movingAverage200,
      ...snapshotValues(indicators),
    },
  })
  if (fetched.annualSeries.length > 0) await saveFundamentals(stock.id, fetched.annualSeries)
  await saveDailyCloses(stock.id, fetched.closes)
}

/**
 * チェック開始日以降の買いの取引のうち、購入時の指標がまだ無いものに作る。
 * 取引の登録直後と、価格更新のついでに呼ばれる。失敗してもログだけ残す
 * （次の価格更新でまた作りにいく）。初期残高（ADR 0008）は実際の購入ではないので作らない。
 */
export async function createMissingSnapshots(stock: {
  id: number
  code: string
  marketSector: string | null
}): Promise<void> {
  if (stock.marketSector === ETF_SECTOR) return
  try {
    const checkStartDate = await getCheckStartDate()
    if (!checkStartDate) return

    const transactions = await prisma.transaction.findMany({
      where: {
        stockId: stock.id,
        transactionType: 'BUY',
        isInitialBalance: false,
        transactionDate: { gte: checkStartDate },
        fundamentalSnapshot: null,
      },
      orderBy: { transactionDate: 'asc' },
    })
    for (const t of transactions) {
      await createSnapshot(stock, {
        transactionId: t.id,
        recordedOn: t.transactionDate,
        price: Number(t.pricePerShare),
        isCheckStart: false,
      })
    }
  } catch (error) {
    console.error(`Failed to create fundamental snapshots for ${stock.code}:`, error)
  }
}

export interface CheckStartSummary {
  checkStartDate: string
  alreadyStarted: boolean
  targetCount: number
  createdCount: number
  failed: { code: string; error: string }[]
  targets: { stockId: number; code: string; stockName: string }[]
}

/**
 * 基準チェックを始める。保有中の銘柄（ETF を除く）のうち購入時の指標が 1 件も無いものに、
 * チェック開始日の値で 1 件ずつ作る。初回の apply で今日をチェック開始日として保存する。
 * 2 回目以降はチェック開始日を変えず、作れなかった銘柄だけを作り直す。
 * apply が false なら DB を変更せず、作る予定の銘柄だけを返す。
 */
export async function startFundamentalCheck(apply: boolean): Promise<CheckStartSummary> {
  const savedStartDate = await getCheckStartDate()
  const checkStartDate = savedStartDate ?? toDateKey(new Date())

  const stocks = await prisma.stock.findMany({
    where: {
      sharesHeld: { gt: 0 },
      fundamentalSnapshots: { none: {} },
      OR: [{ marketSector: null }, { marketSector: { not: ETF_SECTOR } }],
    },
    select: { id: true, code: true, stockName: true },
    orderBy: { id: 'asc' },
  })

  const summary: CheckStartSummary = {
    checkStartDate: formatDateKey(checkStartDate),
    alreadyStarted: savedStartDate !== null,
    targetCount: stocks.length,
    createdCount: 0,
    failed: [],
    targets: stocks.map((s) => ({ stockId: s.id, code: s.code, stockName: s.stockName })),
  }
  if (!apply) return summary

  if (!savedStartDate) {
    await prisma.setting.create({
      data: { key: CHECK_START_DATE_KEY, value: formatDateKey(checkStartDate) },
    })
  }

  // Yahoo のレート制限を避けるため、価格更新と同じく 1 銘柄ずつ直列で処理する
  for (const stock of stocks) {
    try {
      await createSnapshot(stock, { transactionId: null, recordedOn: checkStartDate, isCheckStart: true })
      summary.createdCount++
    } catch (error) {
      summary.failed.push({
        code: stock.code,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return summary
}

// ---- 読み出し ----

export interface FundamentalCheckRow {
  stockId: number
  stockName: string
  code: string
  market: string
  marketSector: string | null
  currentPrice: number
  lastPriceUpdate: Date | null
  // 財務の基準期と取得日。財務の値がまだ無ければ null
  fiscalPeriodEnd: Date | null
  fundamentalFetchedAt: Date | null
  // 判定に使った購入時の指標。無ければ null
  snapshot: { recordedOn: Date; isCheckStart: boolean } | null
  check: FundamentalCheck
  // 売りの判定（ADR 0023）。基準チェックとは比べる相手が違う（購入時ではなく前の通期決算）
  sell: SellSignal
}

function indicatorsOfSnapshot(s: FundamentalSnapshot): IndicatorValues {
  return {
    roe: toNumber(s.roe),
    fcfYield: toNumber(s.fcfYield),
    equityRatio: toNumber(s.equityRatio),
    debtToEquity: toNumber(s.debtToEquity),
    altmanZ: toNumber(s.altmanZ),
    price: Number(s.price),
    movingAverage200: toNumber(s.movingAverage200),
    negativeEquity: s.negativeEquity,
  }
}

/**
 * 保有中の銘柄の基準チェックを読み出す。DB を読むだけで、Yahoo には問い合わせない
 * （読み取り専用ユーザーで動く MCP サーバーからも呼ぶため）。
 *
 * 今の値は、財務の最新値と Stock.currentPrice（最後に価格更新した時点の値）から計算する。
 * 200日線は日次終値（DailyPrice）から計算する。購入時の値は、最新の購入時の指標を使う
 * （売りは銘柄単位で考えるため、直近の買いのときの値と比べる）。
 */
export async function loadFundamentalChecks(
  options: { stockIds?: number[] } = {},
): Promise<FundamentalCheckRow[]> {
  const stocks = await prisma.stock.findMany({
    where: {
      sharesHeld: { gt: 0 },
      ...(options.stockIds ? { id: { in: options.stockIds } } : {}),
    },
    include: {
      fundamentals: { orderBy: { fiscalPeriodEnd: 'desc' } },
      fundamentalSnapshots: { orderBy: [{ recordedOn: 'desc' }, { id: 'desc' }], take: 1 },
    },
    orderBy: { stockName: 'asc' },
  })
  if (stocks.length === 0) return []

  // 200 営業日ぶんに足りるよう、休場日を見込んで 1 年強さかのぼる
  const since = addDays(toDateKey(new Date()), -400)
  const dailyPrices = await prisma.dailyPrice.findMany({
    where: { stockId: { in: stocks.map((s) => s.id) }, priceDate: { gte: since } },
    select: { stockId: true, priceDate: true, close: true },
    orderBy: { priceDate: 'asc' },
  })
  const closesByStock = new Map<number, { priceDate: Date; close: number }[]>()
  for (const d of dailyPrices) {
    const closes = closesByStock.get(d.stockId) ?? []
    closes.push({ priceDate: d.priceDate, close: Number(d.close) })
    closesByStock.set(d.stockId, closes)
  }

  return stocks.map((s): FundamentalCheckRow => {
    const currentPrice = Number(s.currentPrice)
    const price = currentPrice > 0 ? currentPrice : null
    const movingAverage200 = computePriceStats(closesByStock.get(s.id) ?? []).movingAverage200

    // 基準期は fiscalPeriodEnd が最大の行（ADR 0020）。include で降順に並べている
    const latestFundamental = s.fundamentals[0] ?? null

    let current: IndicatorValues | null = null
    if (latestFundamental) {
      const indicators = computeFundamentalIndicators(annualOfRow(latestFundamental), {
        price: price ?? 0,
        currency: currencyOfMarket(s.market),
      })
      current = { ...indicators, price, movingAverage200 }
    }

    const latestSnapshot = s.fundamentalSnapshots[0] ?? null
    return {
      stockId: s.id,
      stockName: s.stockName,
      code: s.code,
      market: s.market,
      marketSector: s.marketSector,
      currentPrice,
      lastPriceUpdate: s.lastPriceUpdate,
      fiscalPeriodEnd: latestFundamental?.fiscalPeriodEnd ?? null,
      fundamentalFetchedAt: latestFundamental?.fetchedAt ?? null,
      snapshot: latestSnapshot
        ? { recordedOn: latestSnapshot.recordedOn, isCheckStart: latestSnapshot.isCheckStart }
        : null,
      check: checkFundamentals({
        market: s.market,
        sector: s.marketSector,
        current,
        purchase: latestSnapshot ? indicatorsOfSnapshot(latestSnapshot) : null,
      }),
      sell: judgeSellSignal({
        market: s.market,
        sector: s.marketSector,
        periods: sellPeriodsOf(s.fundamentals, s.market),
      }),
    }
  })
}
