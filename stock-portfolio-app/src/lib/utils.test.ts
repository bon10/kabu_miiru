import { describe, it, expect } from 'vitest'
import { formatAvgAcquisitionPrice } from '@/lib/utils'

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
