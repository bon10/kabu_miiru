import { describe, it, expect } from 'vitest'
import { formatAvgAcquisitionPrice, formatDate, formatDateTime } from '@/lib/utils'

// 平均取得単価の表示規則（ADR 0010）。
// 取得原価 ÷ 保有株数 は割り切れないことがあるため、表示は小数第2位で四捨五入する。
// 現在価格などに使う formatPrice（国内株は整数、米国株はセント単位）とは桁数が異なる。

describe('formatAvgAcquisitionPrice', () => {
  it('国内株は円建てで小数第2位まで表示する', () => {
    // 1株 @1000 と 2株 @1001 の買い増しで 3002 / 3 = 1000.6666...
    expect(formatAvgAcquisitionPrice(3002 / 3, '国内')).toBe('￥1,000.67')
  })

  it('割り切れる場合も小数第2位まで桁を揃える', () => {
    expect(formatAvgAcquisitionPrice(1250, '国内')).toBe('￥1,250.00')
  })

  it('米国株はドル建てで小数第2位まで表示する', () => {
    expect(formatAvgAcquisitionPrice(123.4567, '米国')).toBe('$123.46')
  })
})

// 取引日・配当日・購入日の表示（docs/2-domain/time-and-dates.md）。
// これらは暦日なので、閲覧場所や実行環境で日付が変わってはならない。
// 入力は絶対時刻（Z 付き ISO）で書く。ローカル暦日で組み立てると
// テスト自体が実行環境のタイムゾーンに依存してしまうため。

describe('formatDate', () => {
  it('日本時間の暦日で表示する', () => {
    // 2026-06-30 09:00 JST
    expect(formatDate('2026-06-30T00:00:00Z')).toBe('2026/06/30')
  })

  // Stock.purchaseDate などは日本時間の 0 時（= 前日 15:00Z）で保存されている
  it('日本時間の 0 時ちょうどでも前日にならない', () => {
    expect(formatDate('2025-09-09T15:00:00Z')).toBe('2025/09/10')
  })

  it('日本時間の 23:59 は翌日に繰り上がらない', () => {
    expect(formatDate('2026-08-21T14:59:59Z')).toBe('2026/08/21')
  })

  it('日本時間で日付が変わると翌日になる', () => {
    expect(formatDate('2026-08-21T15:00:00Z')).toBe('2026/08/22')
  })

  it('Date を渡しても文字列を渡しても同じ結果になる', () => {
    const iso = '2025-09-09T15:00:00Z'
    expect(formatDate(new Date(iso))).toBe(formatDate(iso))
  })
})

describe('formatDateTime', () => {
  it('日本時間の日付と時刻で表示する', () => {
    // 2026-08-14 16:58 JST
    expect(formatDateTime('2026-08-14T07:58:15Z')).toBe('2026/08/14 16:58')
  })

  it('日本時間で日付が変わると翌日になる', () => {
    expect(formatDateTime('2026-08-21T15:00:00Z')).toBe('2026/08/22 00:00')
  })
})
