import { describe, expect, it } from 'vitest'
import {
  compareHoldings,
  nextHoldingSort,
  sortHoldings,
  type HoldingSort,
  type SortableHolding,
} from '@/lib/holdings-sort'

// テスト用の保有行。比較に使う項目だけ持たせる。
function holding(
  stockName: string,
  values: Partial<Omit<SortableHolding, 'stockName'>> = {}
): SortableHolding {
  return {
    stockName,
    market: '国内',
    sharesHeld: 0,
    investmentAmount: 0,
    currentValue: 0,
    profitLoss: 0,
    ytdDividend: 0,
    ...values,
  }
}

const asc = (key: HoldingSort['key']): HoldingSort => ({
  key,
  direction: 'asc',
})
const desc = (key: HoldingSort['key']): HoldingSort => ({
  key,
  direction: 'desc',
})

describe('sortHoldings', () => {
  it('評価損益の降順で並べる（損失は後ろに回る）', () => {
    const rows = [
      holding('A', { profitLoss: -500 }),
      holding('B', { profitLoss: 1200 }),
      holding('C', { profitLoss: 0 }),
    ]

    expect(
      sortHoldings(rows, desc('profitLoss')).map((r) => r.stockName)
    ).toEqual(['B', 'C', 'A'])
  })

  it('評価損益の昇順では損失が先に来る', () => {
    const rows = [
      holding('A', { profitLoss: -500 }),
      holding('B', { profitLoss: 1200 }),
      holding('C', { profitLoss: 0 }),
    ]

    expect(
      sortHoldings(rows, asc('profitLoss')).map((r) => r.stockName)
    ).toEqual(['A', 'C', 'B'])
  })

  it('保有株数は小数でも大小を比較できる', () => {
    const rows = [
      holding('A', { sharesHeld: 1 }),
      holding('B', { sharesHeld: 0.0451 }),
      holding('C', { sharesHeld: 100 }),
    ]

    expect(
      sortHoldings(rows, desc('sharesHeld')).map((r) => r.stockName)
    ).toEqual(['C', 'A', 'B'])
  })

  it('銘柄名は日本語の照合順で並べる', () => {
    const rows = [holding('任天堂'), holding('あいさつ'), holding('ソニー')]

    expect(
      sortHoldings(rows, asc('stockName')).map((r) => r.stockName)
    ).toEqual(['あいさつ', 'ソニー', '任天堂'])
  })

  it('市場でまとめて並べ、同じ市場の中は銘柄名の昇順になる', () => {
    const rows = [
      holding('テスラ', { market: '米国' }),
      holding('任天堂', { market: '国内' }),
      holding('アップル', { market: '米国' }),
      holding('ソニー', { market: '国内' }),
    ]

    const sorted = sortHoldings(rows, asc('market'))

    expect(sorted.map((r) => r.market)).toEqual([
      '国内',
      '国内',
      '米国',
      '米国',
    ])
    expect(sorted.map((r) => r.stockName)).toEqual([
      'ソニー',
      '任天堂',
      'アップル',
      'テスラ',
    ])
  })

  it('市場の降順では市場の並びだけが反転する（同じ市場の中は銘柄名の昇順のまま）', () => {
    const rows = [
      holding('任天堂', { market: '国内' }),
      holding('テスラ', { market: '米国' }),
      holding('アップル', { market: '米国' }),
    ]

    const sorted = sortHoldings(rows, desc('market'))

    expect(sorted.map((r) => r.stockName)).toEqual([
      'アップル',
      'テスラ',
      '任天堂',
    ])
  })

  it('証券会社でまとめて並べ、同じ証券会社の中は銘柄名の昇順になる', () => {
    const rows = [
      holding('任天堂', { brokerName: '楽天' }),
      holding('テスラ', { brokerName: 'SBI' }),
      holding('ソニー', { brokerName: '楽天' }),
    ]

    const sorted = sortHoldings(rows, asc('brokerName'))

    expect(sorted.map((r) => `${r.brokerName}/${r.stockName}`)).toEqual([
      'SBI/テスラ',
      '楽天/ソニー',
      '楽天/任天堂',
    ])
  })

  it('証券会社を持たない行（証券会社別表示）では銘柄名の昇順になる', () => {
    // 証券会社別表示の行は brokerName を持たない。グループ内は同一の証券会社なので
    // 並べ替えても意味がなく、銘柄名で決まるのが正しい。
    const rows = [holding('任天堂'), holding('あいさつ')]

    expect(
      sortHoldings(rows, asc('brokerName')).map((r) => r.stockName)
    ).toEqual(['あいさつ', '任天堂'])
  })

  it('値が同じときは銘柄名の昇順で決める（並びが入力順に左右されない）', () => {
    const rows = [
      holding('さくら', { profitLoss: 100 }),
      holding('あおい', { profitLoss: 100 }),
      holding('かえで', { profitLoss: 100 }),
    ]

    expect(
      sortHoldings(rows, desc('profitLoss')).map((r) => r.stockName)
    ).toEqual(['あおい', 'かえで', 'さくら'])
  })

  it('元の配列を書き換えない（SWR のキャッシュを壊さないため）', () => {
    const rows = [
      holding('A', { sharesHeld: 1 }),
      holding('B', { sharesHeld: 2 }),
    ]

    sortHoldings(rows, desc('sharesHeld'))

    expect(rows.map((r) => r.stockName)).toEqual(['A', 'B'])
  })
})

describe('compareHoldings', () => {
  it('同じ値・同じ銘柄名なら 0 を返す', () => {
    const a = holding('A', { currentValue: 10 })
    const b = holding('A', { currentValue: 10 })

    expect(compareHoldings(a, b, desc('currentValue'))).toBe(0)
  })
})

describe('nextHoldingSort', () => {
  it('同じ列を押すと向きが反転する', () => {
    expect(nextHoldingSort(desc('profitLoss'), 'profitLoss')).toEqual(
      asc('profitLoss')
    )
    expect(nextHoldingSort(asc('profitLoss'), 'profitLoss')).toEqual(
      desc('profitLoss')
    )
  })

  it('別の金額・株数の列を押したら降順から始める（大きい順に見たいため）', () => {
    expect(nextHoldingSort(asc('stockName'), 'profitLoss')).toEqual(
      desc('profitLoss')
    )
    expect(nextHoldingSort(asc('stockName'), 'sharesHeld')).toEqual(
      desc('sharesHeld')
    )
  })

  it('銘柄名・市場・証券会社の列を押したら昇順から始める', () => {
    expect(nextHoldingSort(desc('profitLoss'), 'stockName')).toEqual(
      asc('stockName')
    )
    expect(nextHoldingSort(desc('profitLoss'), 'market')).toEqual(asc('market'))
    expect(nextHoldingSort(desc('profitLoss'), 'brokerName')).toEqual(
      asc('brokerName')
    )
  })
})
