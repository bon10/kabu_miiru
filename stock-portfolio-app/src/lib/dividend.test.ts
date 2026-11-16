import { describe, it, expect } from 'vitest'
import {
  calcDividendReceipt,
  netDividendAmount,
  parseDividendInput,
  parseDividendType,
  perShareFromTotal,
  resolveDividendTax,
  DIVIDEND_CALC_MESSAGES,
  DIVIDEND_TAX_MESSAGES,
  DIVIDEND_TYPE_MESSAGE,
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

describe('parseDividendType', () => {
  it('許可された配当種別はそのまま返す', () => {
    expect(parseDividendType('期末')).toEqual({ ok: true, type: '期末' })
    expect(parseDividendType('分配金')).toEqual({ ok: true, type: '分配金' })
  })

  it('未指定（undefined / null / 空文字）は種別なしの null を返す', () => {
    expect(parseDividendType(undefined)).toEqual({ ok: true, type: null })
    expect(parseDividendType(null)).toEqual({ ok: true, type: null })
    expect(parseDividendType('')).toEqual({ ok: true, type: null })
  })

  it('許可されていない値は弾く', () => {
    expect(parseDividendType('記念')).toEqual({ ok: false })
    expect(parseDividendType(1)).toEqual({ ok: false })
  })
})

describe('perShareFromTotal', () => {
  it('割り切れるときは元の単価に戻る', () => {
    expect(perShareFromTotal(3000, 100)).toBe(30)
    expect(perShareFromTotal(115, 50)).toBe(2.3)
  })

  it('割り切れないときは、掛け直すと同じ配当合計になる最短の小数を返す', () => {
    // 0.70497 × 3 = 2.11491 → 配当合計 2.11 として保存された記録
    const perShare = perShareFromTotal(2.11, 3)
    expect(perShare).toBe(0.703)
    expect(calcDividendReceipt(perShare!, 3)).toEqual({ ok: true, total: 2.11 })
  })

  it('返した単価に数量を掛け直すと必ず元の配当合計になる', () => {
    const cases: Array<[number, number]> = [
      [797, 133],
      [12.34, 10],
      [0.01, 7],
      [123456.78, 9999],
      [5.99, 0.3333],
    ]
    for (const [total, shares] of cases) {
      const perShare = perShareFromTotal(total, shares)
      expect(calcDividendReceipt(perShare!, shares)).toEqual({ ok: true, total })
    }
  })

  it('数量を持たない旧レコード（null）や 0 以下の数量では逆算できず null を返す', () => {
    expect(perShareFromTotal(1000, null)).toBeNull()
    expect(perShareFromTotal(1000, 0)).toBeNull()
  })
})

describe('parseDividendInput', () => {
  const base = {
    stockId: 1,
    dividendPerShare: 30,
    shares: 100,
    paymentDate: '2026-11-10',
  }

  it('明細の写しから保存する値を組み立てる', () => {
    const result = parseDividendInput({ ...base, taxAmount: 609, dividendType: '期末' })
    expect(result).toEqual({
      ok: true,
      data: {
        stockId: 1,
        dividendAmount: 3000,
        shares: 100,
        taxAmount: 609,
        netAmount: 2391,
        currency: 'JPY',
        paymentDate: new Date('2026-11-10T00:00:00.000Z'),
        dividendType: '期末',
      },
    })
  })

  it('税額合計・受取金額が空なら null のまま、種別未指定も null で通す', () => {
    const result = parseDividendInput({ ...base, taxAmount: '', netAmount: null, currency: 'USD' })
    expect(result.ok && result.data).toMatchObject({
      taxAmount: null,
      netAmount: null,
      currency: 'USD',
      dividendType: null,
    })
  })

  it('必須項目が欠けていれば弾く', () => {
    expect(parseDividendInput({ ...base, stockId: undefined }).ok).toBe(false)
    expect(parseDividendInput({ ...base, dividendPerShare: undefined }).ok).toBe(false)
    expect(parseDividendInput({ ...base, paymentDate: '' }).ok).toBe(false)
  })

  it('日付として読めない支払日は弾く', () => {
    expect(parseDividendInput({ ...base, paymentDate: 'abc' })).toEqual({
      ok: false,
      message: '支払日は YYYY-MM-DD で指定してください',
    })
  })

  it('数量・通貨・配当種別・税額の不正はそれぞれのメッセージで弾く', () => {
    expect(parseDividendInput({ ...base, shares: 0 })).toEqual({
      ok: false,
      message: DIVIDEND_CALC_MESSAGES.NO_SHARES,
    })
    expect(parseDividendInput({ ...base, currency: 'EUR' }).ok).toBe(false)
    expect(parseDividendInput({ ...base, dividendType: '記念' })).toEqual({
      ok: false,
      message: DIVIDEND_TYPE_MESSAGE,
    })
    expect(parseDividendInput({ ...base, taxAmount: 5000 })).toEqual({
      ok: false,
      message: DIVIDEND_TAX_MESSAGES.TAX_EXCEEDS_GROSS,
    })
  })
})
