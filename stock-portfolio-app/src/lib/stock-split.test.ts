import { describe, it, expect } from 'vitest'
import {
  chartRangeCovering,
  parseSplitInput,
  parseYahooSplits,
  selectSplitCandidates,
} from '@/lib/stock-split'
import { dateKeyOf, formatDateKey } from '@/lib/date-key'

// 株式分割・併合の入力と、Yahoo から取る分割の候補（ADR 0024）。
// DB とネットワークを伴わない部分を純粋関数として固定する。

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return dateKeyOf(y, m - 1, d)
}

describe('parseYahooSplits', () => {
  // 2026-11-15 に 8473.T で実測したレスポンスの events 部分
  const sbi = {
    chart: {
      result: [
        {
          events: {
            splits: {
              '1764201600': { date: 1764201600, numerator: 2.0, denominator: 1.0, splitRatio: '2:1' },
            },
          },
        },
      ],
    },
  }

  it('numerator を分割後、denominator を分割前の株数として読む', () => {
    const [split] = parseYahooSplits(sbi)
    expect(split.fromShares).toBe(1)
    expect(split.toShares).toBe(2)
  })

  it('date を、その時刻が属する JST 暦日の分割日にする', () => {
    const [split] = parseYahooSplits(sbi)
    expect(formatDateKey(split.splitDate)).toBe('2025-11-27')
  })

  it('期間内に分割が無いと events が無い。空を返す', () => {
    expect(parseYahooSplits({ chart: { result: [{}] } })).toEqual([])
    expect(parseYahooSplits({ chart: { result: [{ events: undefined }] } })).toEqual([])
  })

  it('複数の分割は分割日の昇順で返す', () => {
    const splits = parseYahooSplits({
      chart: {
        result: [
          {
            events: {
              splits: {
                b: { date: 1764201600, numerator: 2, denominator: 1 },
                a: { date: 1632873600, numerator: 5, denominator: 1 },
              },
            },
          },
        ],
      },
    })
    expect(splits.map((s) => formatDateKey(s.splitDate))).toEqual(['2021-09-29', '2025-11-27'])
  })

  it('比率が正の数でない要素は捨てる', () => {
    const splits = parseYahooSplits({
      chart: {
        result: [{ events: { splits: { a: { date: 1764201600, numerator: 0, denominator: 1 } } } }],
      },
    })
    expect(splits).toEqual([])
  })
})

describe('selectSplitCandidates', () => {
  const split = { splitDate: day('2025-11-27'), fromShares: 1, toShares: 2 }

  it('最初の取引より後の分割を候補にする', () => {
    expect(selectSplitCandidates([split], day('2025-09-10'), [])).toEqual([split])
  })

  it('最初の取引の日以前の分割は候補にしない（取引がすでに分割後の株数のため）', () => {
    expect(selectSplitCandidates([split], day('2025-11-27'), [])).toEqual([])
    expect(selectSplitCandidates([split], day('2026-01-10'), [])).toEqual([])
  })

  it('取引が無い銘柄には候補を出さない', () => {
    expect(selectSplitCandidates([split], null, [])).toEqual([])
  })

  it('同じ分割日で登録済みの分割は候補にしない', () => {
    expect(selectSplitCandidates([split], day('2025-09-10'), [day('2025-11-27')])).toEqual([])
  })
})

describe('chartRangeCovering', () => {
  const today = day('2026-11-15')

  it('起点から今日までを含む最短の range を返す', () => {
    expect(chartRangeCovering(day('2026-11-01'), today)).toBe('1mo')
    expect(chartRangeCovering(day('2026-01-10'), today)).toBe('1y')
    expect(chartRangeCovering(day('2025-09-10'), today)).toBe('2y')
    expect(chartRangeCovering(day('2023-01-01'), today)).toBe('5y')
    expect(chartRangeCovering(day('2019-01-01'), today)).toBe('10y')
  })

  it('10 年より前は 10y で打ち切る', () => {
    expect(chartRangeCovering(day('2010-01-01'), today)).toBe('10y')
  })
})

describe('parseSplitInput', () => {
  const today = day('2026-11-15')
  const valid = { splitDate: '2025-11-27', fromShares: 1, toShares: 2 }

  it('正しい入力を暦日キーと数値にして返す', () => {
    const r = parseSplitInput(valid, today)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(formatDateKey(r.value.splitDate)).toBe('2025-11-27')
    expect(r.value.fromShares).toBe(1)
    expect(r.value.toShares).toBe(2)
    expect(r.value.memo).toBeNull()
  })

  it('併合（分割後のほうが少ない）も受け付ける', () => {
    expect(parseSplitInput({ ...valid, fromShares: 5, toShares: 1 }, today).ok).toBe(true)
  })

  it('分割日が無い・日付として読めないものは弾く', () => {
    expect(parseSplitInput({ ...valid, splitDate: undefined }, today).ok).toBe(false)
    expect(parseSplitInput({ ...valid, splitDate: 'abc' }, today).ok).toBe(false)
  })

  it('未来の分割日は弾く（終値がまだ分割後の水準になっていないため）', () => {
    expect(parseSplitInput({ ...valid, splitDate: '2026-11-16' }, today).ok).toBe(false)
    expect(parseSplitInput({ ...valid, splitDate: '2026-11-15' }, today).ok).toBe(true)
  })

  it('株数が正の数でないものは弾く', () => {
    expect(parseSplitInput({ ...valid, fromShares: 0 }, today).ok).toBe(false)
    expect(parseSplitInput({ ...valid, toShares: -1 }, today).ok).toBe(false)
    expect(parseSplitInput({ ...valid, toShares: 'x' }, today).ok).toBe(false)
  })

  it('分割前と分割後が同じ株数のものは弾く', () => {
    expect(parseSplitInput({ ...valid, fromShares: 2, toShares: 2 }, today).ok).toBe(false)
  })
})
