import { describe, it, expect } from 'vitest'
import { calcDividendReceipt } from './dividend'

describe('calcDividendReceipt', () => {
  it('1株あたり配当金 × 保有株数 の総額を返す', () => {
    expect(calcDividendReceipt(30, 100)).toEqual({ ok: true, total: 3000 })
  })

  it('小数の1株配当（米国株のドル建てなど）も掛け算できる', () => {
    expect(calcDividendReceipt(2.3, 50)).toEqual({ ok: true, total: 115 })
  })

  it('保有株数が小数でも掛け算できる', () => {
    expect(calcDividendReceipt(10, 12.5)).toEqual({ ok: true, total: 125 })
  })

  it('浮動小数点の誤差を出さず小数第2位に丸める（Decimal(15,2) 準拠）', () => {
    // 2.3 * 50 は素の JS では 114.9999… になる。丸めて 115 を返すこと。
    expect(calcDividendReceipt(2.3, 50)).toEqual({ ok: true, total: 115 })
    // 3 桁以上の小数は 2 桁に丸める（USD 建て配当の想定）
    expect(calcDividendReceipt(1.234, 10)).toEqual({ ok: true, total: 12.34 })
  })

  it('1株配当が0はエラー（INVALID_PER_SHARE）', () => {
    expect(calcDividendReceipt(0, 100)).toEqual({
      ok: false,
      error: 'INVALID_PER_SHARE',
    })
  })

  it('1株配当が負数はエラー（INVALID_PER_SHARE）', () => {
    expect(calcDividendReceipt(-5, 100)).toEqual({
      ok: false,
      error: 'INVALID_PER_SHARE',
    })
  })

  it('1株配当が NaN はエラー（INVALID_PER_SHARE）', () => {
    expect(calcDividendReceipt(Number.NaN, 100)).toEqual({
      ok: false,
      error: 'INVALID_PER_SHARE',
    })
  })

  it('保有株数が0はエラー（NO_SHARES）', () => {
    expect(calcDividendReceipt(30, 0)).toEqual({
      ok: false,
      error: 'NO_SHARES',
    })
  })

  it('1株配当が不正なら保有株数より先に INVALID_PER_SHARE を返す', () => {
    // 両方不正なとき、入力値である 1 株配当のエラーを優先する
    expect(calcDividendReceipt(0, 0)).toEqual({
      ok: false,
      error: 'INVALID_PER_SHARE',
    })
  })
})
