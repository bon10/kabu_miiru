import { describe, expect, it } from 'vitest'
import {
  checkFundamentals,
  type IndicatorValues,
} from '@/lib/fundamental-check'

// すべての基準を満たす国内株の値
const GOOD: IndicatorValues = {
  roe: 10,
  fcfYield: 4,
  equityRatio: 50,
  debtToEquity: 50,
  altmanZ: 3,
  price: 1100,
  movingAverage200: 1000,
  negativeEquity: false,
}

const itemOf = (result: ReturnType<typeof checkFundamentals>, key: string) =>
  result.items.find((i) => i.key === key)

describe('checkFundamentals', () => {
  it('すべての基準を満たしていれば ok', () => {
    const result = checkFundamentals({ market: '国内', sector: 'Industrials', current: GOOD, purchase: GOOD })

    expect(result.status).toBe('ok')
    expect(result.items.map((i) => i.key)).toEqual([
      'roe',
      'fcfYield',
      'equityRatio',
      'debtToEquity',
      'trend',
    ])
    expect(result.items.every((i) => i.status === 'ok')).toBe(true)
  })

  it('購入時は満たしていて、今は下回っていれば基準割れ', () => {
    const result = checkFundamentals({
      market: '国内',
      sector: 'Industrials',
      current: { ...GOOD, roe: 7 },
      purchase: GOOD,
    })

    expect(itemOf(result, 'roe')?.status).toBe('broken')
    expect(result.status).toBe('broken')
  })

  it('購入時から下回っていれば、購入時から未達（基準割れにはしない）', () => {
    const result = checkFundamentals({
      market: '国内',
      sector: 'Industrials',
      current: { ...GOOD, roe: 6 },
      purchase: { ...GOOD, roe: 7.2 },
    })

    expect(itemOf(result, 'roe')?.status).toBe('unmet_since_purchase')
    expect(result.status).toBe('unmet')
  })

  it('購入時の値が無ければ、今下回っている項目は基準割れとする', () => {
    const result = checkFundamentals({
      market: '国内',
      sector: 'Industrials',
      current: { ...GOOD, fcfYield: 1 },
      purchase: null,
    })

    expect(itemOf(result, 'fcfYield')?.status).toBe('broken')
  })

  it('境界値は基準を満たす（以上・以下）', () => {
    const result = checkFundamentals({
      market: '国内',
      sector: 'Industrials',
      current: { ...GOOD, roe: 8, fcfYield: 3, equityRatio: 40, debtToEquity: 100 },
      purchase: GOOD,
    })

    expect(result.status).toBe('ok')
  })

  it('200日線は 現在値 ÷ 200日線 − 1 をパーセントで持ち、上回っていれば満たす', () => {
    const result = checkFundamentals({
      market: '国内',
      sector: 'Industrials',
      current: { ...GOOD, price: 900, movingAverage200: 1000 },
      purchase: GOOD,
    })

    const trend = itemOf(result, 'trend')
    expect(trend?.current).toBeCloseTo(-10)
    expect(trend?.purchase).toBeCloseTo(10)
    expect(trend?.status).toBe('broken')
  })

  it('今の値が無い項目は no_data で、全体の判定には影響しない', () => {
    const result = checkFundamentals({
      market: '国内',
      sector: 'Industrials',
      current: { ...GOOD, movingAverage200: null },
      purchase: GOOD,
    })

    expect(itemOf(result, 'trend')?.status).toBe('no_data')
    expect(result.status).toBe('ok')
  })

  it('米国株の財務の安全性は Altman Z で見る', () => {
    const result = checkFundamentals({
      market: '米国',
      sector: 'Healthcare',
      current: { ...GOOD, altmanZ: 1.5, equityRatio: 10 },
      purchase: GOOD,
    })

    expect(result.items.map((i) => i.key)).toEqual(['roe', 'fcfYield', 'altmanZ', 'trend'])
    expect(itemOf(result, 'altmanZ')?.status).toBe('broken')
  })

  it('米国株で Altman Z が無ければ、有利子負債倍率で代える', () => {
    const result = checkFundamentals({
      market: '米国',
      sector: 'Healthcare',
      current: { ...GOOD, altmanZ: null, debtToEquity: 120 },
      purchase: { ...GOOD, altmanZ: null },
    })

    expect(result.items.map((i) => i.key)).toEqual(['roe', 'fcfYield', 'debtToEquity', 'trend'])
    expect(itemOf(result, 'debtToEquity')?.status).toBe('broken')
  })

  it('自己資本がマイナスなら、ROE と有利子負債倍率は値が無くても満たさないとする', () => {
    const result = checkFundamentals({
      market: '米国',
      sector: 'Consumer Cyclical',
      current: { ...GOOD, roe: null, debtToEquity: null, altmanZ: null, negativeEquity: true },
      purchase: GOOD,
    })

    expect(itemOf(result, 'roe')?.status).toBe('broken')
    expect(itemOf(result, 'debtToEquity')?.status).toBe('broken')
    expect(result.notes).toContain('negativeEquity')
  })

  it('ETF は判定しない', () => {
    const result = checkFundamentals({ market: '米国', sector: 'ETF', current: null, purchase: null })

    expect(result.status).toBe('not_applicable')
    expect(result.items).toEqual([])
  })

  it('財務の値がまだ無ければ no_data', () => {
    const result = checkFundamentals({ market: '国内', sector: 'Industrials', current: null, purchase: null })

    expect(result.status).toBe('no_data')
  })

  it('銀行・保険・不動産には、基準を割りやすい業種である旨の注記を付ける', () => {
    const financial = checkFundamentals({ market: '国内', sector: 'Financial Services', current: GOOD, purchase: GOOD })
    const realEstate = checkFundamentals({ market: '国内', sector: 'Real Estate', current: GOOD, purchase: GOOD })

    expect(financial.notes).toContain('financialSector')
    expect(realEstate.notes).toContain('realEstateSector')
  })
})
