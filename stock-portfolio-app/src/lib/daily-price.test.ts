import { describe, it, expect } from 'vitest'
import { formatDateKey, toDateKey, parseDailyCloses } from '@/lib/daily-price'

// 日次終値の日付キーとレスポンス解析（ADR 0009）。
// 暦日をキーにする以上、UTC 変換を挟むと JST では 1 日ずれるため、
// ローカル暦日で一貫させることをテストで固定する。

describe('formatDateKey', () => {
  it('ローカル暦日を YYYY-MM-DD で返す', () => {
    expect(formatDateKey(new Date(2025, 8, 10))).toBe('2025-09-10')
  })

  it('月日を 2 桁ゼロ埋めする', () => {
    expect(formatDateKey(new Date(2025, 0, 5))).toBe('2025-01-05')
  })

  // toISOString().slice(0,10) だと JST の暦日 0 時が前日 15:00Z になり日付が戻る
  it('暦日 0 時でも前日にずれない', () => {
    const midnight = new Date(2026, 7, 14, 0, 0, 0)
    expect(formatDateKey(midnight)).toBe('2026-08-14')
  })
})

describe('toDateKey', () => {
  it('時刻を切り落として暦日 0 時にする', () => {
    expect(toDateKey(new Date(2025, 8, 10, 23, 59, 59))).toEqual(new Date(2025, 8, 10))
  })

  it('同じ暦日の異なる時刻は同一キーになる', () => {
    const morning = toDateKey(new Date(2025, 8, 10, 9, 0))
    const evening = toDateKey(new Date(2025, 8, 10, 18, 30))
    expect(morning.getTime()).toBe(evening.getTime())
  })
})

describe('parseDailyCloses', () => {
  // Yahoo は timestamp と close を同じ長さの配列で返す
  const payload = (timestamps: number[], closes: Array<number | null>) => ({
    chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ close: closes }] } }] },
  })

  // 2025-01-06 09:00 JST 相当
  const ts = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

  it('timestamp と close を対にして返す', () => {
    const r = parseDailyCloses(payload([ts('2025-01-06T00:00:00Z')], [2850]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.closes).toHaveLength(1)
    expect(r.closes[0].close).toBe(2850)
  })

  it('close が null の要素は捨てる（休場明けなどで欠ける）', () => {
    const r = parseDailyCloses(
      payload([ts('2025-01-06T00:00:00Z'), ts('2025-01-07T00:00:00Z')], [2850, null]),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.closes).toHaveLength(1)
    expect(r.closes[0].close).toBe(2850)
  })

  it('価格を暦日 0 時のキーに丸める', () => {
    const r = parseDailyCloses(payload([ts('2025-01-06T00:00:00Z')], [2850]))
    if (!r.ok) return
    const d = r.closes[0].priceDate
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
  })

  it('レスポンス形式が不正なら失敗を返す', () => {
    expect(parseDailyCloses({}).ok).toBe(false)
    expect(parseDailyCloses({ chart: { result: [] } }).ok).toBe(false)
  })

  it('有効な終値が 1 件も無ければ失敗を返す', () => {
    const r = parseDailyCloses(payload([ts('2025-01-06T00:00:00Z')], [null]))
    expect(r.ok).toBe(false)
  })
})
