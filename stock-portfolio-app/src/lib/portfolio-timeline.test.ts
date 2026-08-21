import { describe, it, expect } from 'vitest'
import { computeTimeline, type TimelineInput } from '@/lib/portfolio-timeline'

// ポートフォリオ推移の再構成（ADR 0009）。
// DB を伴わない純粋関数として切り出し、次を固定する：
//   - 評価額 = その日の保有株数 × その日の終値 × その日のレート
//   - 非営業日は直前の営業日の終値で埋める（forward-fill）
//   - 起点日より前は返さない
//   - 評価額と投資元本は同一レートで換算する（為替損益を出さない）

// 暦日 0 時（closeMap / rateMap のキーと同じ粒度）
const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const key = (iso: string) => day(iso).getTime()

const JP = { id: 1, code: '7203', stockName: 'トヨタ', market: '国内' }
const US = { id: 2, code: 'AAPL', stockName: 'Apple', market: '米国' }

function input(over: Partial<TimelineInput> = {}): TimelineInput {
  return {
    transactions: [],
    dividends: [],
    stocks: [JP],
    closeMap: new Map(),
    rateMap: new Map(),
    today: day('2025-01-05'),
    range: 'all',
    ...over,
  }
}

const buy = (stockId: number, date: string, shares: number, price: number, fee = 0) => ({
  stockId,
  transactionType: 'BUY' as const,
  shares,
  pricePerShare: price,
  fee,
  transactionDate: day(date),
})

const sell = (stockId: number, date: string, shares: number, price: number, fee = 0) => ({
  stockId,
  transactionType: 'SELL' as const,
  shares,
  pricePerShare: price,
  fee,
  transactionDate: day(date),
})

// 銘柄 1 件ぶんの終値マップ
const closes = (stockId: number, entries: Record<string, number>) =>
  new Map([[stockId, new Map(Object.entries(entries).map(([d, v]) => [key(d), v]))]])

describe('computeTimeline', () => {
  it('取引が無ければ空を返す', () => {
    const r = computeTimeline(input())
    expect(r.points).toEqual([])
    expect(r.baselineDate).toBeNull()
  })

  it('起点日は最も古い取引日になり、それより前の日は返さない', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2025-01-03', 10, 100)],
        closeMap: closes(1, { '2025-01-03': 100, '2025-01-04': 100, '2025-01-05': 100 }),
      }),
    )
    expect(r.baselineDate).toBe('2025-01-03')
    expect(r.points.map((p) => p.date)).toEqual(['2025-01-03', '2025-01-04', '2025-01-05'])
  })

  it('国内株の評価額は 保有株数 × 終値 で算出する', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2025-01-03', 10, 100)],
        closeMap: closes(1, { '2025-01-03': 120 }),
        today: day('2025-01-03'),
      }),
    )
    expect(r.points[0].marketValue).toBe(1200)
    expect(r.points[0].investedPrincipal).toBe(1000)
    expect(r.points[0].unrealizedPL).toBe(200)
  })

  it('取引が無い日も株価変動で評価額が動く', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2025-01-03', 10, 100)],
        closeMap: closes(1, { '2025-01-03': 100, '2025-01-04': 150, '2025-01-05': 90 }),
      }),
    )
    expect(r.points.map((p) => p.marketValue)).toEqual([1000, 1500, 900])
    // 元本は動かない
    expect(r.points.map((p) => p.investedPrincipal)).toEqual([1000, 1000, 1000])
  })

  it('終値の無い日は直前の営業日の終値で埋める', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2025-01-03', 10, 100)],
        // 01-04 は休場で終値が無い
        closeMap: closes(1, { '2025-01-03': 100, '2025-01-05': 130 }),
      }),
    )
    expect(r.points.map((p) => p.marketValue)).toEqual([1000, 1000, 1300])
    expect(r.points.map((p) => p.filledStockCount)).toEqual([0, 1, 0])
  })

  it('起点日が休場でも助走期間の終値を引き継いで評価できる', () => {
    const r = computeTimeline(
      input({
        // 起点日 01-04 に終値が無く、直前営業日 01-03 の値を使う
        transactions: [buy(1, '2025-01-04', 10, 100)],
        closeMap: closes(1, { '2025-01-03': 110, '2025-01-05': 130 }),
      }),
    )
    expect(r.points[0].date).toBe('2025-01-04')
    expect(r.points[0].marketValue).toBe(1100)
    expect(r.missingPriceStocks).toEqual([])
  })

  it('終値が一度も無い銘柄は評価額に算入せず missingPriceStocks で報告する', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2025-01-03', 10, 100)],
        closeMap: new Map(),
        today: day('2025-01-03'),
      }),
    )
    expect(r.points[0].marketValue).toBe(0)
    expect(r.missingPriceStocks).toEqual([{ code: '7203', stockName: 'トヨタ' }])
  })

  it('米国株は評価額も投資元本もその日のレートで換算する', () => {
    const r = computeTimeline(
      input({
        stocks: [US],
        transactions: [buy(2, '2025-01-03', 10, 100)],
        closeMap: closes(2, { '2025-01-03': 120 }),
        rateMap: new Map([[key('2025-01-03'), 150]]),
        today: day('2025-01-03'),
      }),
    )
    expect(r.points[0].marketValue).toBe(10 * 120 * 150)
    expect(r.points[0].investedPrincipal).toBe(10 * 100 * 150)
  })

  it('米国株の評価損益にレート差の影響が混ざらない', () => {
    const withRate = (rate: number) =>
      computeTimeline(
        input({
          stocks: [US],
          transactions: [buy(2, '2025-01-03', 10, 100)],
          closeMap: closes(2, { '2025-01-03': 100 }),
          rateMap: new Map([[key('2025-01-03'), rate]]),
          today: day('2025-01-03'),
        }),
      ).points[0].unrealizedPL

    // 株価が取得単価と同じなら、レートがいくつでも評価損益はゼロ
    expect(withRate(150)).toBe(0)
    expect(withRate(200)).toBe(0)
  })

  it('売却で実現損益が積み上がり、保有は評価額から外れる', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2025-01-03', 10, 100), sell(1, '2025-01-04', 10, 130)],
        closeMap: closes(1, { '2025-01-03': 100, '2025-01-04': 130, '2025-01-05': 130 }),
      }),
    )
    expect(r.points[0].cumulativeRealizedPL).toBe(0)
    expect(r.points[1].cumulativeRealizedPL).toBe(300)
    expect(r.points[1].marketValue).toBe(0)
    expect(r.points[1].investedPrincipal).toBe(0)
    // 売却後も実現損益は維持される
    expect(r.points[2].cumulativeRealizedPL).toBe(300)
  })

  it('受取配当を支払日以降で累計する', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2025-01-03', 10, 100)],
        dividends: [
          { paymentDate: day('2025-01-04'), dividendAmount: 500, currency: 'JPY' },
          { paymentDate: day('2025-01-05'), dividendAmount: 300, currency: 'JPY' },
        ],
        closeMap: closes(1, { '2025-01-03': 100, '2025-01-04': 100, '2025-01-05': 100 }),
      }),
    )
    expect(r.points.map((p) => p.cumulativeDividends)).toEqual([0, 500, 800])
  })

  it('USD 建ての受取配当はその日のレートで円換算する', () => {
    const r = computeTimeline(
      input({
        stocks: [US],
        transactions: [buy(2, '2025-01-03', 10, 100)],
        dividends: [{ paymentDate: day('2025-01-03'), dividendAmount: 2, currency: 'USD' }],
        closeMap: closes(2, { '2025-01-03': 100 }),
        rateMap: new Map([[key('2025-01-03'), 150]]),
        today: day('2025-01-03'),
      }),
    )
    expect(r.points[0].cumulativeDividends).toBe(300)
  })

  it('今月を指定すると当月 1 日から今日までを返す', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2024-06-01', 10, 100)],
        closeMap: closes(1, { '2024-06-01': 100 }),
        today: day('2025-01-05'),
        range: 'thisMonth',
      }),
    )
    expect(r.points[0].date).toBe('2025-01-01')
    expect(r.points[r.points.length - 1].date).toBe('2025-01-05')
  })

  // 先月は他の選択肢と違い、終点が今日ではなく前月末になる
  it('先月を指定すると前月 1 日から前月末日までを返す', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2024-06-01', 10, 100)],
        closeMap: closes(1, { '2024-06-01': 100 }),
        today: day('2025-01-05'),
        range: 'lastMonth',
      }),
    )
    expect(r.points[0].date).toBe('2024-12-01')
    expect(r.points[r.points.length - 1].date).toBe('2024-12-31')
  })

  it('期間が起点日より前に遡っても起点日から返す', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2025-01-03', 10, 100)],
        closeMap: closes(1, { '2025-01-03': 100 }),
        range: '5y',
      }),
    )
    expect(r.points[0].date).toBe('2025-01-03')
  })

  // 先月より後に買い始めた場合、その期間には描けるデータが無い
  it('起点日が期間の終点より後なら空を返す', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2025-01-03', 10, 100)],
        closeMap: closes(1, { '2025-01-03': 100 }),
        today: day('2025-01-05'),
        range: 'lastMonth',
      }),
    )
    expect(r.points).toEqual([])
    // 起点日そのものは返す（UI が「この期間にはデータがない」と説明できるように）
    expect(r.baselineDate).toBe('2025-01-03')
  })

  // 期間を絞っても、累計値は起点日からの積み上げでなければならない
  it('期間を絞っても累計配当は起点日からの累計になる', () => {
    const r = computeTimeline(
      input({
        transactions: [buy(1, '2024-11-01', 10, 100)],
        dividends: [
          { paymentDate: day('2024-11-10'), dividendAmount: 500, currency: 'JPY' },
          { paymentDate: day('2025-01-02'), dividendAmount: 300, currency: 'JPY' },
        ],
        closeMap: closes(1, { '2024-11-01': 100 }),
        today: day('2025-01-05'),
        range: 'thisMonth',
      }),
    )
    // 期間外（11月）の 500 円も含まれた累計になる
    expect(r.points[0].cumulativeDividends).toBe(500)
    expect(r.points[r.points.length - 1].cumulativeDividends).toBe(800)
  })
})
