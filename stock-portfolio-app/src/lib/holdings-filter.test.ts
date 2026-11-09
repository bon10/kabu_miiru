import { describe, expect, it } from 'vitest'
import {
  UNSET_SECTOR,
  holdingFilterOptions,
  matchesHoldingFilter,
} from '@/lib/holdings-filter'

const stock = (market: string, marketSector: string | null) => ({
  market,
  marketSector,
})

describe('matchesHoldingFilter', () => {
  it('条件を指定しなければすべて通す', () => {
    expect(matchesHoldingFilter(stock('国内', null), {})).toBe(true)
  })

  it('市場で絞り込む', () => {
    expect(matchesHoldingFilter(stock('国内', null), { market: '国内' })).toBe(true)
    expect(matchesHoldingFilter(stock('米国', null), { market: '国内' })).toBe(false)
  })

  it('セクターで絞り込む', () => {
    const filter = { sector: 'Technology' }
    expect(matchesHoldingFilter(stock('米国', 'Technology'), filter)).toBe(true)
    expect(matchesHoldingFilter(stock('米国', 'Energy'), filter)).toBe(false)
    expect(matchesHoldingFilter(stock('米国', null), filter)).toBe(false)
  })

  it('未設定を指定すると、セクターが空の銘柄だけ通す', () => {
    const filter = { sector: UNSET_SECTOR }
    expect(matchesHoldingFilter(stock('国内', null), filter)).toBe(true)
    expect(matchesHoldingFilter(stock('国内', ''), filter)).toBe(true)
    expect(matchesHoldingFilter(stock('国内', 'Technology'), filter)).toBe(false)
  })

  it('市場とセクターの両方を満たす銘柄だけ通す', () => {
    const filter = { market: '国内', sector: 'Technology' }
    expect(matchesHoldingFilter(stock('国内', 'Technology'), filter)).toBe(true)
    expect(matchesHoldingFilter(stock('米国', 'Technology'), filter)).toBe(false)
  })
})

describe('holdingFilterOptions', () => {
  it('実在する市場・セクターを重複なく並べて返す', () => {
    const options = holdingFilterOptions([
      stock('米国', 'Technology'),
      stock('国内', 'Energy'),
      stock('国内', 'Technology'),
    ])
    expect(options.markets).toEqual(['国内', '米国'])
    expect(options.sectors).toEqual(['Energy', 'Technology'])
    expect(options.hasUnsetSector).toBe(false)
  })

  it('セクターが空の銘柄があれば hasUnsetSector を立てる（sectors には入れない）', () => {
    const options = holdingFilterOptions([stock('国内', null), stock('国内', '')])
    expect(options.sectors).toEqual([])
    expect(options.hasUnsetSector).toBe(true)
  })
})
