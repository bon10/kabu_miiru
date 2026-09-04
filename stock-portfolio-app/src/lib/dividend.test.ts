import { describe, it, expect } from 'vitest'
import {
  calcDividendReceipt,
  netDividendAmount,
  resolveDividendTax,
} from './dividend'

describe('calcDividendReceipt', () => {
  it('1株あたり配当金 × 数量 の配当合計を返す', () => {
    expect(calcDividendReceipt(30, 100)).toEqual({ ok: true, total: 3000 })
  })

  it('小数の1株配当（米国株のドル建てなど）も掛け算できる', () => {
    expect(calcDividendReceipt(2.3, 50)).toEqual({ ok: true, total: 115 })
  })

  it('数量が小数でも掛け算できる', () => {
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

  it('数量が0はエラー（NO_SHARES）', () => {
    expect(calcDividendReceipt(30, 0)).toEqual({
      ok: false,
      error: 'NO_SHARES',
    })
  })

  it('1株配当が不正なら数量より先に INVALID_PER_SHARE を返す', () => {
    // 両方不正なとき、先に読む 1 株配当のエラーを優先する
    expect(calcDividendReceipt(0, 0)).toEqual({
      ok: false,
      error: 'INVALID_PER_SHARE',
    })
  })
})

describe('resolveDividendTax', () => {
  it('税額だけ入力すると受取金額を「合計 − 税額」で埋める（国内株の明細）', () => {
    // フルテック 6546: 単価10 × 数量100 = 1,000、税額 203 → 受取 797
    expect(resolveDividendTax(1000, 203, null)).toEqual({
      ok: true,
      tax: 203,
      net: 797,
    })
  })

  it('受取金額だけ入力すると税額を「合計 − 受取金額」で埋める（米国株の明細）', () => {
    // TSM: 合計 0.94、明細の税額合計は空欄で受取 0.60 → 現地源泉徴収税込みで 0.34
    expect(resolveDividendTax(0.94, null, 0.6)).toEqual({
      ok: true,
      tax: 0.34,
      net: 0.6,
    })
  })

  it('両方入力されたら引き算せずそのまま採る（合計との一致は検証しない）', () => {
    // 米国株は「税額合計 + 受取金額 ≠ 配当合計」になりうるため、突き合わせない
    expect(resolveDividendTax(3.52, 0, 2.55)).toEqual({
      ok: true,
      tax: 0,
      net: 2.55,
    })
  })

  it('両方未入力なら税額不明のまま null を返す（旧レコードと同じ扱い）', () => {
    expect(resolveDividendTax(1000, null, null)).toEqual({
      ok: true,
      tax: null,
      net: null,
    })
  })

  it('非課税（税額0）なら受取金額は合計と同額になる', () => {
    expect(resolveDividendTax(1000, 0, null)).toEqual({
      ok: true,
      tax: 0,
      net: 1000,
    })
  })

  it('引き算の浮動小数点誤差を出さず小数第2位に丸める', () => {
    // 3.52 - 2.55 は素の JS では 0.9700000000000002 になる
    expect(resolveDividendTax(3.52, null, 2.55)).toEqual({
      ok: true,
      tax: 0.97,
      net: 2.55,
    })
  })

  it('税額が負数はエラー（INVALID_TAX）', () => {
    expect(resolveDividendTax(1000, -1, null)).toEqual({
      ok: false,
      error: 'INVALID_TAX',
    })
  })

  it('受取金額が負数はエラー（INVALID_NET）', () => {
    expect(resolveDividendTax(1000, null, -1)).toEqual({
      ok: false,
      error: 'INVALID_NET',
    })
  })

  it('税額が配当合計を超えたらエラー（TAX_EXCEEDS_GROSS）', () => {
    expect(resolveDividendTax(1000, 1001, null)).toEqual({
      ok: false,
      error: 'TAX_EXCEEDS_GROSS',
    })
  })

  it('受取金額が配当合計を超えたらエラー（NET_EXCEEDS_GROSS）', () => {
    expect(resolveDividendTax(1000, null, 1001)).toEqual({
      ok: false,
      error: 'NET_EXCEEDS_GROSS',
    })
  })
})

describe('netDividendAmount', () => {
  it('受取金額があればそれを返す', () => {
    expect(netDividendAmount(1000, 797)).toBe(797)
  })

  it('受取金額が null の旧レコードは税引前で代用する', () => {
    expect(netDividendAmount(1000, null)).toBe(1000)
  })

  it('受取金額が undefined でも税引前で代用する', () => {
    expect(netDividendAmount(1000, undefined)).toBe(1000)
  })

  it('受取金額が0なら0を返す（税引前で代用しない）', () => {
    expect(netDividendAmount(1000, 0)).toBe(0)
  })
})
