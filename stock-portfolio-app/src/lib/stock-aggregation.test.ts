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

  it('初回購入日・最終購入日・最終売却日を返す', () => {
    const r = replayTransactions([
      buy({ id: 1, shares: 100, pricePerShare: 1000, transactionDate: d('2025-01-01') }),
      buy({ id: 2, shares: 50, pricePerShare: 1100, transactionDate: d('2025-04-01') }),
      sell({ id: 3, shares: 10, pricePerShare: 1200, transactionDate: d('2025-05-01') }),
    ])
    expect(r.firstPurchaseDate).toEqual(d('2025-01-01'))
    expect(r.lastPurchaseDate).toEqual(d('2025-04-01'))
    expect(r.lastSaleDate).toEqual(d('2025-05-01'))
  })

  it('買い増ししても初回購入日は最初の BUY のまま動かない', () => {
    const first = buy({ id: 1, shares: 100, pricePerShare: 1000, transactionDate: d('2025-01-01') })
    const additional = buy({
      id: 2,
      shares: 50,
      pricePerShare: 1100,
      transactionDate: d('2025-04-01'),
    })
    expect(replayTransactions([first]).firstPurchaseDate).toEqual(d('2025-01-01'))
    expect(replayTransactions([first, additional]).firstPurchaseDate).toEqual(d('2025-01-01'))
  })

  // 全株売却で保有株数・取得原価はゼロに戻るが、初回購入日は履歴上の最初の購入を指し続ける。
  it('全株売却して買い直しても初回購入日は遡らない', () => {
    const r = replayTransactions([
      buy({ id: 1, shares: 100, pricePerShare: 1000, transactionDate: d('2025-01-01') }),
      sell({ id: 2, shares: 100, pricePerShare: 1200, transactionDate: d('2025-02-01') }),
      buy({ id: 3, shares: 100, pricePerShare: 900, transactionDate: d('2025-03-01') }),
    ])
    expect(r.firstPurchaseDate).toEqual(d('2025-01-01'))
    expect(r.lastPurchaseDate).toEqual(d('2025-03-01'))
  })

  // 初期残高 Transaction（ADR 0008）は既存のどの取引よりも前に置かれる BUY なので、
  // それを持つ銘柄の初回購入日は起点日になる。起点日は購入日が判明していない銘柄では
  // TSV 取り込み日の推定値であり、実際の初回購入日とは限らない。
  it('初期残高が最初の BUY なら初回購入日はその起点日になる', () => {
    const r = replayTransactions([
      buy({ id: 1, shares: 30, pricePerShare: 1000, transactionDate: d('2025-09-10') }),
      buy({ id: 2, shares: 10, pricePerShare: 1300, transactionDate: d('2025-11-20') }),
    ])
    expect(r.firstPurchaseDate).toEqual(d('2025-09-10'))
  })

  // 孤立した SELL は集計から外れるため、初回購入日は SELL より後の BUY になる。
  it('先行する BUY が無い SELL は初回購入日に影響しない', () => {
    const r = replayTransactions([
      sell({ id: 7, shares: 5, pricePerShare: 1200, transactionDate: d('2025-01-01') }),
      buy({ id: 1, shares: 100, pricePerShare: 1000, transactionDate: d('2025-03-01') }),
    ])
    expect(r.firstPurchaseDate).toEqual(d('2025-03-01'))
  })

  it('売買が無ければ初回購入日・最終購入日・最終売却日は null', () => {
    const r = replayTransactions([])
    expect(r.firstPurchaseDate).toBeNull()
    expect(r.lastPurchaseDate).toBeNull()
    expect(r.lastSaleDate).toBeNull()
  })

  it('売却のみなら初回購入日は null のまま', () => {
    const r = replayTransactions([sell({ id: 7, shares: 5, pricePerShare: 1200 })])
    expect(r.firstPurchaseDate).toBeNull()
  })

  // 同一取引日の BUY と SELL は、渡された配列の順序どおりに処理される。
  // 取引フォームが日付だけを受け取り transactionDate が時刻を持たないため、
  // 同一日の並び順は登録順（id 昇順）で決める（TRANSACTION_REPLAY_ORDER）。
  // 下の 2 ケースは、同じ取引集合でも順序で結果が変わること＝並び順を
  // 固定しなければならない理由を示す。
  describe('同一取引日に BUY と SELL がある場合', () => {
    const sameDayBuy = buy({ id: 2, shares: 1, pricePerShare: 1400, transactionDate: d('2025-03-01') })
    const sameDaySell = sell({ id: 3, shares: 1, pricePerShare: 1500, transactionDate: d('2025-03-01') })
    const priorBuy = buy({ id: 1, shares: 1, pricePerShare: 1000, transactionDate: d('2025-01-01') })

    it('BUY が先なら当日の買い増しを含む平均取得単価で実現損益を出す', () => {
      const r = replayTransactions([priorBuy, sameDayBuy, sameDaySell])
      // 買い増し後の平均取得単価 (1000 + 1400) / 2 = 1200
      expect(r.realizedProfitLoss).toBe(300)
      expect(r.shares).toBe(1)
      expect(r.costBasis).toBe(1200)
    })

    it('SELL が先だと買い増し前の平均取得単価で実現損益が変わる', () => {
      const r = replayTransactions([priorBuy, sameDaySell, sameDayBuy])
      // 買い増し前の平均取得単価 1000 で売却したことになり、実現損益が 200 増える
      expect(r.realizedProfitLoss).toBe(500)
      expect(r.shares).toBe(1)
      expect(r.costBasis).toBe(1400)
    })

    // 順序で変わるのは実現損益と未実現損益の「内訳」だけで、合計は変わらない。
    // 登録順が実際の約定順とズレても総損益は正しいままであることを示す。
    // 同一日の並び順を登録順で決めてよいと判断した根拠（ADR 0003 補足）。
    it('順序が変わっても 実現損益 + 未実現損益 は変わらない', () => {
      const closePrice = 1500
      const totalPL = (txs: ReplayTransaction[]) => {
        const r = replayTransactions(txs)
        return r.realizedProfitLoss + (closePrice * r.shares - r.costBasis)
      }
      expect(totalPL([priorBuy, sameDayBuy, sameDaySell])).toBe(600)
      expect(totalPL([priorBuy, sameDaySell, sameDayBuy])).toBe(600)
    })
  })
})
