import { describe, expect, it } from 'vitest'
import {
  UNSET_GROUP_NAME,
  breakdownHoldings,
  uninvestedSectors,
} from '@/lib/portfolio-breakdown'

const row = (
  values: Partial<{
    brokerName: string
    market: string
    marketSector: string | null
    investmentAmount: number
    currentValue: number
    profitLoss: number
  }>,
) => ({
  brokerName: '楽天',
  market: '国内',
  marketSector: 'Technology',
  investmentAmount: 0,
  currentValue: 0,
  profitLoss: 0,
  ...values,
})

describe('breakdownHoldings', () => {
  it('セクターごとに金額を合計し、評価額の大きい順に並べる', () => {
    const { groups } = breakdownHoldings(
      [
        row({ marketSector: 'Energy', investmentAmount: 100, currentValue: 120, profitLoss: 20 }),
        row({ marketSector: 'Technology', investmentAmount: 200, currentValue: 300, profitLoss: 100 }),
        row({ marketSector: 'Energy', investmentAmount: 100, currentValue: 80, profitLoss: -20 }),
      ],
      'sector',
    )
    expect(groups.map((g) => g.name)).toEqual(['Technology', 'Energy'])
    expect(groups[1]).toMatchObject({
      stockCount: 2,
      investmentAmount: 200,
      currentValue: 200,
      profitLoss: 0,
    })
  })

  it('比率は評価額の合計に対するパーセント、損益率は投資額に対するパーセント', () => {
    const { groups, total } = breakdownHoldings(
      [
        row({ marketSector: 'Energy', investmentAmount: 100, currentValue: 150, profitLoss: 50 }),
        row({ marketSector: 'Technology', investmentAmount: 50, currentValue: 50, profitLoss: 0 }),
      ],
      'sector',
    )
    expect(groups[0].weight).toBeCloseTo(75)
    expect(groups[0].profitLossRate).toBeCloseTo(50)
    expect(total).toMatchObject({ stockCount: 2, currentValue: 200, weight: 100 })
  })

  it('セクター未入力の銘柄は「未設定」にまとめる', () => {
    const { groups } = breakdownHoldings(
      [row({ marketSector: null, currentValue: 10 }), row({ marketSector: '', currentValue: 10 })],
      'sector',
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ name: UNSET_GROUP_NAME, stockCount: 2 })
  })

  it('市場・証券会社でもまとめられる', () => {
    const rows = [
      row({ market: '国内', brokerName: '楽天', currentValue: 10 }),
      row({ market: '米国', brokerName: 'SBI', currentValue: 30 }),
    ]
    expect(breakdownHoldings(rows, 'market').groups.map((g) => g.name)).toEqual(['米国', '国内'])
    expect(breakdownHoldings(rows, 'broker').groups.map((g) => g.name)).toEqual(['SBI', '楽天'])
  })

  it('評価額の合計が 0 なら比率は 0', () => {
    const { groups } = breakdownHoldings([row({ currentValue: 0 })], 'sector')
    expect(groups[0].weight).toBe(0)
  })
})

describe('uninvestedSectors', () => {
  it('Yahoo の分類のうち、保有していないセクターを返す（ETF と未設定は数えない）', () => {
    const result = uninvestedSectors([
      row({ marketSector: 'Technology' }),
      row({ marketSector: 'ETF' }),
      row({ marketSector: null }),
    ])
    expect(result).toHaveLength(10)
    expect(result).not.toContain('Technology')
    expect(result).toContain('Energy')
  })
})
