import { describe, it, expect } from 'vitest'
import { TIMELINE_RANGES, isTimelineRange, resolveRange } from '@/lib/timeline-range'

// 推移グラフの期間プリセット（Issue #9）。
// 「今月」「先月」は暦月の範囲、「N年」は今日から遡る範囲で、性質が違う。
// とくに先月は終点が今日ではなく前月末になる点をテストで固定する。

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 起点日が十分古い前提での解決結果
const resolve = (range: string, today: string, baseline = '2020-01-01') =>
  resolveRange(range as never, day(today), day(baseline))

describe('TIMELINE_RANGES', () => {
  it('6 つの選択肢を提供する', () => {
    expect(TIMELINE_RANGES.map((r) => r.value)).toEqual([
      'thisMonth',
      'lastMonth',
      '1y',
      '3y',
      '5y',
      'all',
    ])
  })

  it('既知の値だけを期間として受け付ける', () => {
    expect(isTimelineRange('thisMonth')).toBe(true)
    expect(isTimelineRange('all')).toBe(true)
    expect(isTimelineRange('2y')).toBe(false)
    expect(isTimelineRange('')).toBe(false)
  })
})

describe('resolveRange', () => {
  describe('今月', () => {
    it('当月 1 日から今日まで', () => {
      const r = resolve('thisMonth', '2026-08-16')
      expect(r.start).toEqual(day('2026-08-01'))
      expect(r.end).toEqual(day('2026-08-16'))
    })

    it('月初でも当月 1 日から始まる', () => {
      const r = resolve('thisMonth', '2026-08-01')
      expect(r.start).toEqual(day('2026-08-01'))
      expect(r.end).toEqual(day('2026-08-01'))
    })
  })

  describe('先月', () => {
    // ここが他の選択肢と違う点。終点が今日ではなく前月末になる
    it('前月 1 日から前月末日まで（終点が今日ではない）', () => {
      const r = resolve('lastMonth', '2026-08-16')
      expect(r.start).toEqual(day('2026-07-01'))
      expect(r.end).toEqual(day('2026-07-31'))
    })

    it('30 日で終わる月を正しく扱う', () => {
      const r = resolve('lastMonth', '2026-05-10')
      expect(r.end).toEqual(day('2026-04-30'))
    })

    it('年をまたぐ（1 月なら前年 12 月）', () => {
      const r = resolve('lastMonth', '2026-01-10')
      expect(r.start).toEqual(day('2025-12-01'))
      expect(r.end).toEqual(day('2025-12-31'))
    })

    it('うるう年の 2 月末を正しく扱う', () => {
      const r = resolve('lastMonth', '2028-03-05')
      expect(r.end).toEqual(day('2028-02-29'))
    })
  })

  describe('直近 N 年', () => {
    it('1年は今日の 1 年前から今日まで', () => {
      const r = resolve('1y', '2026-08-16')
      expect(r.start).toEqual(day('2025-08-16'))
      expect(r.end).toEqual(day('2026-08-16'))
    })

    it('3年・5年も暦年で遡る', () => {
      expect(resolve('3y', '2026-08-16').start).toEqual(day('2023-08-16'))
      expect(resolve('5y', '2026-08-16').start).toEqual(day('2021-08-16'))
    })
  })

  describe('全期間', () => {
    it('起点日から今日まで', () => {
      const r = resolve('all', '2026-08-16', '2025-02-16')
      expect(r.start).toEqual(day('2025-02-16'))
      expect(r.end).toEqual(day('2026-08-16'))
    })
  })

  describe('起点日による切り詰め', () => {
    // 起点日より前は保有が不明なので描かない（ADR 0009）
    it('起点日より前に遡る期間は起点日で打ち切る', () => {
      const r = resolve('5y', '2026-08-16', '2025-09-10')
      expect(r.start).toEqual(day('2025-09-10'))
    })

    it('起点日より後の期間はそのまま', () => {
      const r = resolve('thisMonth', '2026-08-16', '2025-09-10')
      expect(r.start).toEqual(day('2026-08-01'))
    })

    // 起点日が先月より後なら、その期間には表示できるデータが無い
    it('起点日が期間の終点より後なら空の期間になる', () => {
      const r = resolve('lastMonth', '2026-08-16', '2026-08-05')
      expect(r.isEmpty).toBe(true)
    })

    it('表示できるデータがあれば空ではない', () => {
      expect(resolve('lastMonth', '2026-08-16', '2020-01-01').isEmpty).toBe(false)
    })
  })
})
