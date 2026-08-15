import { describe, it, expect } from 'vitest'
import { replayTransactions, type ReplayTransaction } from '@/lib/stock-aggregation'

// 平均取得単価法での再生ロジック（ADR 0003）。
// DB を伴わない純粋関数として切り出し、保有株数・取得原価・実現損益の
// 計算規則と、保有ゼロ時点の SELL の扱いを固定する。

const d = (iso: string) => new Date(iso)

const buy = (
  over: Partial<ReplayTransaction> & Pick<ReplayTransaction, 'shares' | 'pricePerShare'>,
): ReplayTransaction => ({
  id: 1,
  transactionType: 'BUY',
  fee: 0,
  transactionDate: d('2025-01-01'),
  ...over,
})

const sell = (
  over: Partial<ReplayTransaction> & Pick<ReplayTransaction, 'shares' | 'pricePerShare'>,
): ReplayTransaction => ({
  id: 2,
  transactionType: 'SELL',
  fee: 0,
  transactionDate: d('2025-02-01'),
  ...over,
})

describe('replayTransactions', () => {
  it('取引が無ければ保有ゼロを返す', () => {
    const r = replayTransactions([])
    expect(r.shares).toBe(0)
    expect(r.costBasis).toBe(0)
    expect(r.realizedProfitLoss).toBe(0)
    expect(r.orphanedSells).toEqual([])
  })

  it('BUY で保有株数と取得原価が増え、手数料は取得原価に含まれる', () => {
    const r = replayTransactions([buy({ shares: 100, pricePerShare: 1000, fee: 500 })])
    expect(r.shares).toBe(100)
    expect(r.costBasis).toBe(100 * 1000 + 500)
  })

  it('複数の BUY で取得単価が加重平均になる', () => {
    const r = replayTransactions([
      buy({ id: 1, shares: 100, pricePerShare: 1000 }),
      buy({ id: 2, shares: 100, pricePerShare: 2000 }),
    ])
    expect(r.shares).toBe(200)
    // (100×1000 + 100×2000) / 200 = 1500
    expect(r.costBasis / r.shares).toBe(1500)
  })

  it('SELL で実現損益が確定し、手数料が差し引かれる', () => {
    const r = replayTransactions([
      buy({ id: 1, shares: 100, pricePerShare: 1000 }),
      sell({ id: 2, shares: 50, pricePerShare: 1200, fee: 100 }),
    ])
    // (1200 - 1000) × 50 - 100 = 9900
    expect(r.realizedProfitLoss).toBe(9900)
    expect(r.shares).toBe(50)
    expect(r.costBasis).toBe(50 * 1000)
  })

  it('全株売却で保有株数と取得原価がゼロになる', () => {
    const r = replayTransactions([
      buy({ id: 1, shares: 100, pricePerShare: 1000 }),
      sell({ id: 2, shares: 100, pricePerShare: 1200 }),
    ])
    expect(r.shares).toBe(0)
    expect(r.costBasis).toBe(0)
    expect(r.realizedProfitLoss).toBe(20000)
  })

  it('保有株数を超える売却は保有分までに切り詰める', () => {
    const r = replayTransactions([
      buy({ id: 1, shares: 100, pricePerShare: 1000 }),
      sell({ id: 2, shares: 150, pricePerShare: 1200 }),
    ])
    expect(r.shares).toBe(0)
    // 150 株ではなく保有していた 100 株分だけが実現損益になる
    expect(r.realizedProfitLoss).toBe(20000)
  })

  // ここが今回の修正点。以前は保有ゼロ時点の SELL を黙って読み飛ばしており、
  // 実現損益が警告なく消えていた（ADR 0008）。
  it('先行する BUY が無い SELL を orphanedSells として報告する', () => {
    const r = replayTransactions([sell({ id: 7, shares: 5, pricePerShare: 1200 })])
    expect(r.orphanedSells).toEqual([
      { transactionId: 7, transactionDate: d('2025-02-01'), shares: 5 },
    ])
    expect(r.realizedProfitLoss).toBe(0)
  })

  it('孤立した SELL があっても残りの取引の集計は継続する', () => {
    const r = replayTransactions([
      sell({ id: 7, shares: 5, pricePerShare: 1200, transactionDate: d('2025-01-01') }),
      buy({ id: 1, shares: 100, pricePerShare: 1000, transactionDate: d('2025-03-01') }),
    ])
    expect(r.orphanedSells).toHaveLength(1)
    expect(r.shares).toBe(100)
    expect(r.costBasis).toBe(100000)
  })

  it('最終購入日・最終売却日を返す', () => {
    const r = replayTransactions([
      buy({ id: 1, shares: 100, pricePerShare: 1000, transactionDate: d('2025-01-01') }),
      buy({ id: 2, shares: 50, pricePerShare: 1100, transactionDate: d('2025-04-01') }),
      sell({ id: 3, shares: 10, pricePerShare: 1200, transactionDate: d('2025-05-01') }),
    ])
    expect(r.lastPurchaseDate).toEqual(d('2025-04-01'))
    expect(r.lastSaleDate).toEqual(d('2025-05-01'))
  })

  it('売買が無ければ最終購入日・最終売却日は null', () => {
    const r = replayTransactions([])
    expect(r.lastPurchaseDate).toBeNull()
    expect(r.lastSaleDate).toBeNull()
  })
})
