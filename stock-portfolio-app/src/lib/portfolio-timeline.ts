import { prisma } from '@/lib/prisma'
import { toDateKey, formatDateKey } from '@/lib/daily-price'
import { getUsdJpyRateMap } from '@/lib/exchange-rate'
import { isUsStock } from '@/lib/currency'

// ポートフォリオ推移の再構成（ADR 0008）。
//
// 評価額・投資元本は保存せず、原資料（取引履歴・日次終値・日次レート）から
// 読み取り時に組み立てる。過去の取引や初期残高の起点日を直せば、過去のグラフも
// そのまま追従する（ADR 0003 の「Transaction が Source of Truth」を時系列へ適用）。
//
// 円換算は「その日のレート」で評価額と投資元本の両方に適用する。評価額だけ日次、
// 原価は当日レート、のように混ぜると差分に為替の影響が紛れ込むため（ADR 0005）。

export interface TimelinePoint {
  date: string
  // その日の保有株を日次終値で評価した合計（円換算済み）
  marketValue: number
  // その日に投じている取得原価の合計（円換算済み）
  investedPrincipal: number
  // marketValue − investedPrincipal
  unrealizedPL: number
  // その日までに確定した実現損益の累計（円換算済み）
  cumulativeRealizedPL: number
  // その日までに受け取った配当の累計（円換算済み）
  cumulativeDividends: number
  // 終値が実測値でない銘柄の数（前営業日の値で補完したか、そもそも終値が無い）
  filledStockCount: number
}

export interface TimelineResult {
  points: TimelinePoint[]
  // 起点日。これより前は保有が不明のため描画しない
  baselineDate: string | null
  // 日次終値が 1 件も無く評価額に算入できなかった銘柄
  missingPriceStocks: Array<{ code: string; stockName: string }>
}

interface StockMeta {
  id: number
  code: string
  stockName: string
  market: string
}

// 日次終値を「銘柄 → 暦日 → 終値」で引ける形に読み出す。
// 全期間を 1 クエリで取り、日ごとの再検索を避ける。
async function loadCloseMap(from: Date): Promise<Map<number, Map<number, number>>> {
  const rows = await prisma.dailyPrice.findMany({
    where: { priceDate: { gte: toDateKey(from) } },
    orderBy: { priceDate: 'asc' },
    select: { stockId: true, priceDate: true, close: true },
  })

  const map = new Map<number, Map<number, number>>()
  for (const row of rows) {
    let byDate = map.get(row.stockId)
    if (!byDate) {
      byDate = new Map<number, number>()
      map.set(row.stockId, byDate)
    }
    byDate.set(toDateKey(row.priceDate).getTime(), Number(row.close))
  }
  return map
}

// 直近の値を保持しながら日を進めるための状態。
// 非営業日・取得失敗日は直前の営業日の値を引き継ぐ（forward-fill）。
class ForwardFill {
  private last: number | null = null
  private filled = false

  // その日の実測値を渡す。undefined なら直前の値を引き継ぐ
  next(actual: number | undefined): { value: number | null; isFilled: boolean } {
    if (actual !== undefined) {
      this.last = actual
      this.filled = false
    } else if (this.last !== null) {
      this.filled = true
    }
    return { value: this.last, isFilled: this.filled }
  }
}

// 指定期間のポートフォリオ推移を組み立てる。
//
// months に null を渡すと起点日から今日までの全期間を返す。
export async function buildPortfolioTimeline(months: number | null): Promise<TimelineResult> {
  const [transactions, dividends, stocks] = await Promise.all([
    prisma.transaction.findMany({ orderBy: { transactionDate: 'asc' } }),
    prisma.dividendHistory.findMany({ orderBy: { paymentDate: 'asc' } }),
    prisma.stock.findMany({ select: { id: true, code: true, stockName: true, market: true } }),
  ])

  if (transactions.length === 0) {
    return { points: [], baselineDate: null, missingPriceStocks: [] }
  }

  const stockById = new Map<number, StockMeta>(stocks.map((s) => [s.id, s]))
  const today = toDateKey(new Date())

  // 起点日 = 最も古い取引日。初期残高 Transaction がここに置かれる（ADR 0007）。
  // これより前は保有が不明なため描画対象にしない。
  const baselineDate = toDateKey(transactions[0].transactionDate)
  // 「直近 N ヶ月」は暦月で遡る（30 日換算だと 12 ヶ月が 360 日になり 1 年に足りない）
  const monthsAgo = new Date(today.getFullYear(), today.getMonth() - (months ?? 0), today.getDate())
  const rangeStart = months
    ? new Date(Math.max(baselineDate.getTime(), monthsAgo.getTime()))
    : baselineDate

  // 起点日そのものが休場日（土日祝）だと、その日の終値が無く forward-fill の
  // 引き継ぎ元も無いため評価額を出せない。起点日より前から助走させて直前営業日の
  // 終値を拾えるようにする。年末年始・大型連休を跨いでも足りる長さを取る。
  const WARMUP_DAYS = 14
  const warmupStart = new Date(
    baselineDate.getFullYear(),
    baselineDate.getMonth(),
    baselineDate.getDate() - WARMUP_DAYS,
  )

  const [closeMap, rateMap] = await Promise.all([
    loadCloseMap(warmupStart),
    getUsdJpyRateMap(warmupStart),
  ])

  // 日次終値も日次レートも、その日のレコードが無ければ直前の値を引き継ぐ。
  // 銘柄ごとに独立した状態を持つ（日米で営業日が異なるため）。
  const fillByStock = new Map<number, ForwardFill>()
  for (const s of stocks) fillByStock.set(s.id, new ForwardFill())
  const rateFill = new ForwardFill()

  // 取引・配当は日付順に並んでいるので、日を進めながら先頭から消費する
  let txIndex = 0
  let divIndex = 0
  const heldShares = new Map<number, number>()
  const costBasis = new Map<number, number>()
  let realizedPLUsd = 0
  let realizedPLJpy = 0
  let dividendsJpy = 0

  const points: TimelinePoint[] = []
  const missingPriceStockIds = new Set<number>()

  // 暦日を 1 日ずつ進める。ミリ秒加算だと夏時間のある地域で正午からずれ、
  // 暦日 0 時をキーにしている closeMap / rateMap と一致しなくなるため日付単位で進める。
  const nextDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)

  // 助走期間（warmupStart 〜 起点日の前日）は forward-fill の状態を作るためだけに
  // 回す。取引も配当もこの期間には存在しないため、集計結果には影響しない。
  for (let day = new Date(warmupStart); day <= today; day = nextDay(day)) {
    const dayKey = day.getTime()

    // その日のレート。未取得日は直前の値を使う
    const rate = rateFill.next(rateMap.get(dayKey)).value

    // その日までの取引を保有状態へ反映する（平均取得単価法）
    while (txIndex < transactions.length && toDateKey(transactions[txIndex].transactionDate) <= day) {
      const tx = transactions[txIndex++]
      const shares = Number(tx.shares)
      const price = Number(tx.pricePerShare)
      const fee = Number(tx.fee)
      const held = heldShares.get(tx.stockId) ?? 0
      const cost = costBasis.get(tx.stockId) ?? 0
      const isUs = isUsStock(stockById.get(tx.stockId)?.market ?? '')

      if (tx.transactionType === 'BUY') {
        heldShares.set(tx.stockId, held + shares)
        costBasis.set(tx.stockId, cost + shares * price + fee)
      } else if (tx.transactionType === 'SELL' && held > 0) {
        const avgPrice = cost / held
        const sellShares = Math.min(shares, held)
        // 実現損益は確定した時点のレートで円に固定する。後日レートが動いても
        // 確定済みの損益は変わらないため、当日レートで再換算してはならない
        const gain = (price - avgPrice) * sellShares - fee
        if (isUs) {
          if (rate !== null) realizedPLJpy += gain * rate
          else realizedPLUsd += gain
        } else {
          realizedPLJpy += gain
        }
        costBasis.set(tx.stockId, cost - avgPrice * sellShares)
        const remaining = held - sellShares
        heldShares.set(tx.stockId, remaining <= 0 ? 0 : remaining)
        if (remaining <= 0) costBasis.set(tx.stockId, 0)
      }
    }

    // その日までの受取配当を積む。受取通貨で判定して円換算する（ADR 0006）
    while (divIndex < dividends.length && toDateKey(dividends[divIndex].paymentDate) <= day) {
      const d = dividends[divIndex++]
      const amount = Number(d.dividendAmount)
      dividendsJpy += d.currency === 'USD' && rate !== null ? amount * rate : amount
    }

    // 全銘柄の forward-fill を毎日進める。保有銘柄だけを進めると、その銘柄を
    // 買った初日がたまたま休場日だったときに直前営業日の終値を引き継げず、
    // 「終値が無い」と誤判定してしまうため。
    const closeByStock = new Map<number, { value: number | null; isFilled: boolean }>()
    for (const s of stocks) {
      const fill = fillByStock.get(s.id)
      if (!fill) continue
      closeByStock.set(s.id, fill.next(closeMap.get(s.id)?.get(dayKey)))
    }

    // その日の評価額と投資元本を、同一レートで円換算して集計する
    let marketValue = 0
    let investedPrincipal = 0
    let filledStockCount = 0

    for (const [stockId, shares] of heldShares) {
      if (shares <= 0) continue

      const meta = stockById.get(stockId)
      const isUs = isUsStock(meta?.market ?? '')
      const factor = isUs ? rate : 1

      investedPrincipal += (costBasis.get(stockId) ?? 0) * (factor ?? 0)

      const close = closeByStock.get(stockId)
      if (!close || close.value === null) {
        // その日までに終値が 1 件も無い銘柄。評価額に算入できないため報告する
        missingPriceStockIds.add(stockId)
        filledStockCount++
        continue
      }
      if (close.isFilled) filledStockCount++
      marketValue += shares * close.value * (factor ?? 0)
    }

    if (day >= rangeStart) {
      points.push({
        date: formatDateKey(day),
        marketValue: Math.round(marketValue * 100) / 100,
        investedPrincipal: Math.round(investedPrincipal * 100) / 100,
        unrealizedPL: Math.round((marketValue - investedPrincipal) * 100) / 100,
        // 換算レートが無い期間に確定した米国株の実現損益は円に直せないため、
        // レートが手に入った時点以降のぶんだけを円建てで積む
        cumulativeRealizedPL:
          Math.round((realizedPLJpy + realizedPLUsd * (rate ?? 0)) * 100) / 100,
        cumulativeDividends: Math.round(dividendsJpy * 100) / 100,
        filledStockCount,
      })
    }
  }

  return {
    points,
    baselineDate: formatDateKey(baselineDate),
    missingPriceStocks: [...missingPriceStockIds].map((id) => ({
      code: stockById.get(id)?.code ?? String(id),
      stockName: stockById.get(id)?.stockName ?? '',
    })),
  }
}
