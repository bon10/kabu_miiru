import { describe, expect, it } from 'vitest'
import { fundamentalValues, type IndicatorValues } from '@/lib/fundamental-check'

const values = (overrides: Partial<IndicatorValues> = {}): IndicatorValues => ({
  roe: 10,
  fcfYield: 5,
  equityRatio: 50,
  debtToEquity: 50,
  altmanZ: 3,
  price: 1000,
  movingAverage200: 900,
  negativeEquity: false,
  ...overrides,
})

const jp = (current: IndicatorValues | null, purchase: IndicatorValues | null = null) =>
  fundamentalValues({ market: '国内', sector: 'Industrials', current, purchase })

const itemOf = (result: ReturnType<typeof fundamentalValues>, key: string) =>
  result.items.find((i) => i.key === key)

describe('fundamentalValues', () => {
  it('国内株は ROE・FCF利回り・自己資本比率・有利子負債倍率・200日線を出す', () => {
    expect(jp(values()).items.map((i) => i.key)).toEqual([
      'roe',
      'fcfYield',
      'equityRatio',
      'debtToEquity',
      'trend',
    ])
  })

  it('米国株は財務の安全性を Altman Z で出す', () => {
    const result = fundamentalValues({
      market: '米国',
      sector: 'Technology',
      current: values(),
      purchase: null,
    })
    expect(result.items.map((i) => i.key)).toEqual(['roe', 'fcfYield', 'altmanZ', 'trend'])
  })

  it('Altman Z が無い米国株は有利子負債倍率で代える', () => {
    const result = fundamentalValues({
      market: '米国',
      sector: 'Technology',
      current: values({ altmanZ: null }),
      purchase: null,
    })
    expect(result.items.map((i) => i.key)).toEqual(['roe', 'fcfYield', 'debtToEquity', 'trend'])
  })

  it('今の値が基準を満たすかだけを出し、買ったあとに下がったかは見ない', () => {
    // 購入時 10% → 今 6%。以前は「基準割れ」としていたが、ここでは満たさないだけ
    const result = jp(values({ roe: 6 }), values({ roe: 10 }))
    expect(itemOf(result, 'roe')).toMatchObject({ current: 6, purchase: 10, meetsNow: false })
  })

  it('購入時から基準に届いていない項目も、満たさないとしか言わない', () => {
    const result = jp(values({ roe: 6 }), values({ roe: 5 }))
    expect(itemOf(result, 'roe')?.meetsNow).toBe(false)
  })

  it('200日線は現在値が何 % 上かで判定する', () => {
    expect(itemOf(jp(values()), 'trend')?.meetsNow).toBe(true)
    expect(itemOf(jp(values({ price: 800 })), 'trend')?.meetsNow).toBe(false)
  })

  it('値が無い項目は判定できない（null）', () => {
    expect(itemOf(jp(values({ fcfYield: null })), 'fcfYield')?.meetsNow).toBeNull()
  })

  it('自己資本がマイナスなら ROE と有利子負債倍率を満たさないとみなし、注記を付ける', () => {
    const result = jp(values({ roe: null, debtToEquity: null, negativeEquity: true }))
    expect(itemOf(result, 'roe')?.meetsNow).toBe(false)
    expect(itemOf(result, 'debtToEquity')?.meetsNow).toBe(false)
    expect(result.notes).toContain('negativeEquity')
  })

  it('ETF は対象外', () => {
    const result = fundamentalValues({
      market: '国内',
      sector: 'ETF',
      current: values(),
      purchase: null,
    })
    expect(result).toEqual({ applicable: false, hasData: false, items: [], notes: [] })
  })

  it('財務の値が無ければ項目を出さず、業種の注記だけ返す', () => {
    const result = fundamentalValues({
      market: '国内',
      sector: 'Financial Services',
      current: null,
      purchase: null,
    })
    expect(result).toEqual({
      applicable: true,
      hasData: false,
      items: [],
      notes: ['financialSector'],
    })
  })

  it('不動産には業種の注記を付ける', () => {
    const result = fundamentalValues({
      market: '国内',
      sector: 'Real Estate',
      current: values(),
      purchase: null,
    })
    expect(result.notes).toEqual(['realEstateSector'])
  })
})
