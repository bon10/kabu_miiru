import { addDays, dateKeyParts } from '@/lib/date-key'
import { parseDailyCloses, type DailyClose } from '@/lib/daily-price'
import { getApiSymbol } from '@/lib/utils'

// 銘柄の財務の値と、そこから計算する指標（ROE・FCF利回り・自己資本比率・
// 有利子負債倍率・Altman Z）、株価の履歴から計算する値（200日線・安値）。
//
// 銘柄選びのスキル（value-stock-screener）と、保有銘柄の基準割れの判定で同じ値を
// 使うため、取得と計算をここに集める（ADR 0020）。
//
// 財務の値は Yahoo Finance の fundamentals-timeseries（非公式 API）の通期の値を使う。
// 同じ Yahoo の quoteSummary の financialData にも ROE などがあるが、直近12か月と
// 通期が混ざり、どの期の値かも返らないため使わない。

// 財務の項目と、timeseries API の type の対応
const ANNUAL_TYPES = {
  equity: 'annualStockholdersEquity',
  totalAssets: 'annualTotalAssets',
  totalLiabilities: 'annualTotalLiabilitiesNetMinorityInterest',
  totalDebt: 'annualTotalDebt',
  workingCapital: 'annualWorkingCapital',
  retainedEarnings: 'annualRetainedEarnings',
  ebit: 'annualEBIT',
  revenue: 'annualTotalRevenue',
  netIncome: 'annualNetIncomeCommonStockholders',
  freeCashFlow: 'annualFreeCashFlow',
  // 発行済株式数から自己株式を除いた数
  sharesOutstanding: 'annualOrdinarySharesNumber',
} as const

type AnnualField = keyof typeof ANNUAL_TYPES

export type AnnualFundamentals = {
  // 基準期（自己資本が取れた最新の決算期末日。YYYY-MM-DD）
  fiscalPeriodEnd: string
  // 財務の通貨（JPY / USD / TWD など）
  currency: string
} & Record<AnnualField, number | null>

interface TimeseriesPoint {
  asOfDate?: string
  currencyCode?: string
  reportedValue?: { raw?: number }
}

interface TimeseriesResponse {
  timeseries?: {
    result?: Array<{ meta?: { type?: string[] } } & Record<string, unknown>> | null
  }
}

/**
 * timeseries API のレスポンスから、基準期の財務の値を取り出す。
 *
 * 項目ごとに最新期が違うことがある（JNJ の利益剰余金は最新が 2 年前など）。
 * 違う期の値を混ぜて比率を計算しないよう、自己資本が取れた最新期を基準期とし、
 * 各項目は基準期の値だけを使う。基準期の値が無い項目は null。
 * 自己資本が取れなければ、比率を 1 つも計算できないので null を返す。
 */
export function parseAnnualFundamentals(payload: unknown): AnnualFundamentals | null {
  const results = (payload as TimeseriesResponse)?.timeseries?.result ?? []

  const pointsByType = new Map<string, TimeseriesPoint[]>()
  for (const r of results) {
    const type = r.meta?.type?.[0]
    if (!type) continue
    const points = ((r[type] as Array<TimeseriesPoint | null> | undefined) ?? []).filter(
      (p): p is TimeseriesPoint =>
        !!p && !!p.asOfDate && Number.isFinite(p.reportedValue?.raw),
    )
    pointsByType.set(type, points)
  }

  const equityPoints = pointsByType.get(ANNUAL_TYPES.equity) ?? []
  const latestEquity = equityPoints.reduce<TimeseriesPoint | null>(
    (latest, p) => (!latest || p.asOfDate! > latest.asOfDate! ? p : latest),
    null,
  )
  if (!latestEquity) return null

  const fiscalPeriodEnd = latestEquity.asOfDate!
  const valueAt = (field: AnnualField): number | null => {
    const point = pointsByType.get(ANNUAL_TYPES[field])?.find((p) => p.asOfDate === fiscalPeriodEnd)
    return point?.reportedValue?.raw ?? null
  }

  const fields = Object.fromEntries(
    (Object.keys(ANNUAL_TYPES) as AnnualField[]).map((field) => [field, valueAt(field)]),
  ) as Record<AnnualField, number | null>

  return {
    fiscalPeriodEnd,
    currency: latestEquity.currencyCode ?? '',
    ...fields,
  }
}

export interface FundamentalIndicators {
  // 以下の比率はパーセントの値（12% なら 12）。評価損益率・配当利回りと単位を揃える
  roe: number | null
  equityRatio: number | null
  // 有利子負債 ÷ 自己資本。国内でいう有利子負債倍率（D/E レシオ）
  debtToEquity: number | null
  fcfYield: number | null
  // 財務の通貨建て
  marketCap: number | null
  altmanZ: number | null
  // 自己資本がマイナス。自社株買いなどで起き、ROE などが意味を持たなくなる
  negativeEquity: boolean
}

const ratio = (numerator: number | null, denominator: number | null): number | null =>
  numerator === null || denominator === null || denominator === 0 ? null : numerator / denominator

const percentOf = (numerator: number | null, denominator: number | null): number | null => {
  const r = ratio(numerator, denominator)
  return r === null ? null : r * 100
}

/**
 * 財務の値と現在値から指標を計算する。
 *
 * 時価総額は 現在値 × 基準期末の株式数 で出す。期末より後の自社株買いなどは
 * 反映されないが、毎日の終値に追従させるため、取得時点の時価総額は使わない。
 * 財務と株価の通貨が違う銘柄（台湾ドルで決算する TSM の ADR など）は、
 * 株式数の単位も ADR と違うことがあるため、時価総額を使う値は計算しない。
 */
export function computeFundamentalIndicators(
  annual: AnnualFundamentals,
  quote: { price: number; currency: string },
): FundamentalIndicators {
  const { equity } = annual
  const negativeEquity = equity !== null && equity < 0
  const positiveEquity = equity !== null && equity > 0 ? equity : null

  const marketCap =
    annual.currency === quote.currency && annual.sharesOutstanding !== null && quote.price > 0
      ? quote.price * annual.sharesOutstanding
      : null

  return {
    roe: percentOf(annual.netIncome, positiveEquity),
    equityRatio: percentOf(equity, annual.totalAssets),
    debtToEquity: percentOf(annual.totalDebt, positiveEquity),
    fcfYield: percentOf(annual.freeCashFlow, marketCap),
    marketCap,
    altmanZ: altmanZOf(annual, marketCap),
    negativeEquity,
  }
}

// Altman Z（1968 年の上場製造業向けの元の式）。項目が 1 つでも欠けたら null。
//   Z = 1.2×運転資本/総資産 + 1.4×利益剰余金/総資産 + 3.3×EBIT/総資産
//     + 0.6×時価総額/負債合計 + 1.0×売上高/総資産
function altmanZOf(annual: AnnualFundamentals, marketCap: number | null): number | null {
  const ta = annual.totalAssets
  const terms = [
    [1.2, ratio(annual.workingCapital, ta)],
    [1.4, ratio(annual.retainedEarnings, ta)],
    [3.3, ratio(annual.ebit, ta)],
    [0.6, ratio(marketCap, annual.totalLiabilities)],
    [1.0, ratio(annual.revenue, ta)],
  ] as const
  if (terms.some(([, value]) => value === null)) return null
  return terms.reduce((sum, [weight, value]) => sum + weight * value!, 0)
}

export interface PriceStats {
  // 終値ベース。場中の安値は含まない
  movingAverage200: number | null
  yearToDateLow: number | null
  low52Week: number | null
}

/**
 * 日次終値（古い順）から 200日線・年初来安値・52週安値を計算する。
 * 年と 52 週の境目は、今日ではなく最新の終値の日を基準にする（休場日に呼んでも
 * 直近の営業日までで計算するため）。
 */
export function computePriceStats(closes: DailyClose[]): PriceStats {
  if (closes.length === 0) {
    return { movingAverage200: null, yearToDateLow: null, low52Week: null }
  }

  const latestDate = closes[closes.length - 1].priceDate
  const latestYear = dateKeyParts(latestDate).year
  const from52Week = addDays(latestDate, -364).getTime()

  const last200 = closes.slice(-200)
  const min = (values: number[]) => (values.length > 0 ? Math.min(...values) : null)

  return {
    movingAverage200:
      last200.length < 200 ? null : last200.reduce((sum, c) => sum + c.close, 0) / 200,
    yearToDateLow: min(
      closes.filter((c) => dateKeyParts(c.priceDate).year === latestYear).map((c) => c.close),
    ),
    low52Week: min(closes.filter((c) => c.priceDate.getTime() >= from52Week).map((c) => c.close)),
  }
}

// ---- 取得（ネットワーク） ----

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

export interface StockFundamentals {
  code: string
  apiSymbol: string
  price: number
  priceCurrency: string
  priceDate: Date
  annual: AnnualFundamentals | null
  indicators: FundamentalIndicators | null
  priceStats: PriceStats
  // 計算に使った日次終値（古い順・2 年ぶん）。保有銘柄なら DailyPrice に保存して再利用する
  closes: DailyClose[]
}

// timeseries API は quoteSummary と違い crumb なしで返る（2026-11-12 に実測。
// 非公式 API のため仕様の保証は無い）。period1 は基準期を含めて数期ぶんあれば足りる。
export async function fetchAnnualFundamentals(apiSymbol: string): Promise<AnnualFundamentals | null> {
  const period1 = Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60
  const period2 = Math.floor(Date.now() / 1000)
  const url =
    `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(apiSymbol)}` +
    `?type=${Object.values(ANNUAL_TYPES).join(',')}&period1=${period1}&period2=${period2}`

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`財務の値を取得できませんでした（HTTP ${response.status}）`)
  return parseAnnualFundamentals(await response.json())
}

// 200日線に 200 営業日、52週安値に 1 年ぶんの終値が要るため、2 年ぶんを取る
async function fetchPriceHistory(
  apiSymbol: string,
): Promise<{ closes: DailyClose[]; currency: string }> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(apiSymbol)}` +
    `?range=2y&interval=1d`

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`株価の履歴を取得できませんでした（HTTP ${response.status}）`)
  const data = await response.json()
  const parsed = parseDailyCloses(data)
  if (!parsed.ok) throw new Error(`株価の履歴を取得できませんでした（${parsed.error}）`)
  return { closes: parsed.closes, currency: data.chart?.result?.[0]?.meta?.currency ?? '' }
}

/**
 * 銘柄コード（日本株は数字、米国株はティッカー）から、財務の値・指標・株価の値を取得する。
 * 現在値は最新の終値。財務の値が取れなければ annual と indicators は null。
 */
export async function fetchStockFundamentals(code: string): Promise<StockFundamentals> {
  const apiSymbol = getApiSymbol(code)
  const [annual, history] = await Promise.all([
    fetchAnnualFundamentals(apiSymbol),
    fetchPriceHistory(apiSymbol),
  ])

  const latest = history.closes[history.closes.length - 1]
  return {
    code,
    apiSymbol,
    price: latest.close,
    priceCurrency: history.currency,
    priceDate: latest.priceDate,
    annual,
    indicators: annual
      ? computeFundamentalIndicators(annual, { price: latest.close, currency: history.currency })
      : null,
    priceStats: computePriceStats(history.closes),
    closes: history.closes,
  }
}
