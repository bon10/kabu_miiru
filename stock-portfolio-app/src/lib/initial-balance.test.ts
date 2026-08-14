import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BASELINE_DATE,
  planInitialBalance,
  replayShares,
} from '@/lib/initial-balance'

// 初期残高 Transaction の生成判断（ADR 0008）。
// 「何株ぶんを、いつの日付で作るか」を DB 非依存の純粋関数として固定する。

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const buy = (shares: number, date = '2025-01-01') => ({
  transactionType: 'BUY' as const,
  shares,
  transactionDate: day(date),
})
const sell = (shares: number, date = '2025-02-01') => ({
  transactionType: 'SELL' as const,
  shares,
  transactionDate: day(date),
})

describe('replayShares', () => {
  it('取引が無ければ 0', () => {
    expect(replayShares([])).toBe(0)
  })

  it('BUY と SELL を差し引きする', () => {
    expect(replayShares([buy(100), sell(30)])).toBe(70)
  })

  it('保有ゼロ時点の SELL は無視する', () => {
    expect(replayShares([sell(5), buy(100, '2025-03-01')])).toBe(100)
  })

  it('保有株数を超える SELL は 0 で下げ止まる', () => {
    expect(replayShares([buy(10), sell(50)])).toBe(0)
  })
})

describe('planInitialBalance', () => {
  const stock = {
    id: 1,
    code: '7203',
    stockName: 'トヨタ',
    sharesHeld: 100,
    avgAcquisitionPrice: 2800,
    purchaseDate: null as Date | null,
    transactions: [] as ReturnType<typeof buy>[],
  }

  it('取引が無い保有には保有株数ぶんの初期残高を作る', () => {
    const p = planInitialBalance(stock)
    expect(p.kind).toBe('create')
    if (p.kind !== 'create') return
    expect(p.shares).toBe(100)
    expect(p.pricePerShare).toBe(2800)
  })

  it('購入日が無ければ取り込み日を起点日にする', () => {
    const p = planInitialBalance(stock)
    if (p.kind !== 'create') return
    expect(p.baselineDate).toEqual(DEFAULT_BASELINE_DATE)
    expect(p.fromPurchaseDate).toBe(false)
  })

  it('購入日があればそれを起点日にする', () => {
    const p = planInitialBalance({ ...stock, purchaseDate: day('2025-02-16') })
    if (p.kind !== 'create') return
    expect(p.baselineDate).toEqual(day('2025-02-16'))
    expect(p.fromPurchaseDate).toBe(true)
  })

  it('既存の取引で保有株数を説明できるならスキップする', () => {
    const p = planInitialBalance({ ...stock, transactions: [buy(100)] })
    expect(p.kind).toBe('skip')
  })

  it('取引で一部しか説明できないなら不足分だけ作る', () => {
    const p = planInitialBalance({ ...stock, transactions: [buy(40)] })
    if (p.kind !== 'create') return
    expect(p.shares).toBe(60)
  })

  // 取得原価が無いと「全額が利益」という誤った実現損益を生むため、推定せず外す
  it('平均取得単価が未設定ならスキップする', () => {
    const p = planInitialBalance({ ...stock, avgAcquisitionPrice: 0 })
    expect(p.kind).toBe('skip')
    if (p.kind !== 'skip') return
    expect(p.reason).toContain('平均取得単価')
  })

  // 初期残高が後ろに来ると先行 SELL が保有ゼロの時点に取り残される（ADR 0008）
  it('既存取引より前になるよう起点日を前倒しする', () => {
    const p = planInitialBalance({
      ...stock,
      purchaseDate: day('2025-06-01'),
      transactions: [sell(10, '2025-03-01')],
    })
    if (p.kind !== 'create') return
    expect(p.baselineDate.getTime()).toBeLessThan(day('2025-03-01').getTime())
  })

  it('前倒しが不要なら購入日をそのまま使う', () => {
    const p = planInitialBalance({
      ...stock,
      purchaseDate: day('2025-01-01'),
      transactions: [sell(10, '2025-03-01')],
    })
    if (p.kind !== 'create') return
    expect(p.baselineDate).toEqual(day('2025-01-01'))
  })
})
