import { describe, it, expect } from 'vitest'
import { parseSector, shouldFetchSector } from '@/lib/sector'

describe('shouldFetchSector', () => {
  it('未入力なら取りに行く', () => {
    expect(shouldFetchSector(null)).toBe(true)
    expect(shouldFetchSector('')).toBe(true)
  })

  // 手入力の自由記述は Yahoo の分類で上書きする
  it('Yahoo の分類に無い値なら取りに行く', () => {
    expect(shouldFetchSector('自動車')).toBe(true)
  })

  it('Yahoo の分類か ETF なら取りに行かない', () => {
    expect(shouldFetchSector('Technology')).toBe(false)
    expect(shouldFetchSector('Consumer Cyclical')).toBe(false)
    expect(shouldFetchSector('ETF')).toBe(false)
  })
})

describe('parseSector', () => {
  const payload = (quoteType: string, sector?: string) => ({
    quoteSummary: {
      result: [{ quoteType: { quoteType }, assetProfile: sector ? { sector } : {} }],
      error: null,
    },
  })

  it('個別株は assetProfile の sector を返す', () => {
    expect(parseSector(payload('EQUITY', 'Technology'))).toBe('Technology')
  })

  // Yahoo は ETF に sector を返さない
  it('ETF は ETF を返す', () => {
    expect(parseSector(payload('ETF'))).toBe('ETF')
  })

  it('sector が無い個別株は null', () => {
    expect(parseSector(payload('EQUITY'))).toBeNull()
  })

  it('Yahoo のエラー応答は null', () => {
    expect(
      parseSector({ quoteSummary: { result: null, error: { code: 'Unauthorized' } } }),
    ).toBeNull()
  })
})
