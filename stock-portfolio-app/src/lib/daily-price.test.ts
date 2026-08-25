import { describe, it, expect } from 'vitest'
import { parseDailyCloses } from '@/lib/daily-price'
import { formatDateKey } from '@/lib/date-key'

// Yahoo Finance のレスポンス解析（ADR 0009）。
// 暦日キーそのものの振る舞いは date-key.test.ts で固定しているので、
// ここでは timestamp と close の対応付け・欠損の扱いに絞る。

describe('parseDailyCloses', () => {
  // Yahoo は timestamp と close を同じ長さの配列で返す
  const payload = (timestamps: number[], closes: Array<number | null>) => ({
    chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ close: closes }] } }] },
  })

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

  // Yahoo の日次 timestamp はその市場の寄り付き時刻。東京は 09:00 JST（= 00:00Z）
  it('東京市場の寄り付きをその営業日のキーにする', () => {
    const r = parseDailyCloses(payload([ts('2025-01-06T00:00:00Z')], [2850]))
    if (!r.ok) return
    expect(formatDateKey(r.closes[0].priceDate)).toBe('2025-01-06')
  })

  // 米国市場の寄り付きは 09:30 ET（冬時間で 14:30Z）。JST では同日の 23:30 にあたる
  it('米国市場の寄り付きも同じ暦日のキーになる', () => {
    const r = parseDailyCloses(payload([ts('2025-01-06T14:30:00Z')], [242.21]))
    if (!r.ok) return
    expect(formatDateKey(r.closes[0].priceDate)).toBe('2025-01-06')
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
