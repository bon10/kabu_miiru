import { describe, it, expect } from 'vitest'
import { dividendYieldOf, expectedAnnualDividendOf } from './expected-dividend'

// 配当利回り（BR-201）。パーセントの値で返す（2.74% なら 2.74）。
describe('dividendYieldOf', () => {
  it('1株配当金 ÷ 現在価格 × 100 を返す', () => {
    expect(dividendYieldOf(22, 802)).toBeCloseTo(2.7431, 4)
  })

  it('米国株（ドル建て同士）も同じ式で求める', () => {
    expect(dividendYieldOf(0.96, 192)).toBeCloseTo(0.5, 4)
  })

  it('現在価格が 0 なら 0（価格未取得の銘柄）', () => {
    expect(dividendYieldOf(22, 0)).toBe(0)
  })

  it('1株配当金が 0 なら 0（無配）', () => {
    expect(dividendYieldOf(0, 802)).toBe(0)
  })
})

// 予想年間配当（BR-200）。1株配当金と同じ通貨建てで返す。
describe('expectedAnnualDividendOf', () => {
  it('1株配当金 × 保有株数 を返す', () => {
    expect(expectedAnnualDividendOf(22, 100)).toBe(2200)
  })

  it('浮動小数点の誤差を出さず小数第2位に丸める', () => {
    // 2.3 * 50 は素の JS では 114.9999… になる
    expect(expectedAnnualDividendOf(2.3, 50)).toBe(115)
  })

  it('保有株数が 0（売却済み）なら 0', () => {
    expect(expectedAnnualDividendOf(22, 0)).toBe(0)
  })
})
