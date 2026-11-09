import { ETF_SECTOR, YAHOO_SECTORS } from '@/lib/sector'

// 保有をセクター・市場・証券会社のどれかでまとめた構成。
// MCP サーバー（mcp/）から、分野ごとの偏りや未投資の分野を見るために使う。
// 金額は loadHoldingRows が円換算済みで返す値をそのまま合計する。

export type BreakdownKey = 'sector' | 'market' | 'broker'

// セクター未入力の銘柄をまとめるグループ名
export const UNSET_GROUP_NAME = '未設定'

interface BreakdownInput {
  brokerName: string
  market: string
  marketSector: string | null
  investmentAmount: number
  currentValue: number
  profitLoss: number
}

export interface BreakdownGroup {
  name: string
  stockCount: number
  investmentAmount: number
  currentValue: number
  profitLoss: number
  // 投資額に対する評価損益（パーセントの値。Stock.profitLossRate と同じ単位）
  profitLossRate: number
  // 評価額の合計に対する、このグループの評価額（パーセントの値）
  weight: number
}

function groupNameOf(row: BreakdownInput, by: BreakdownKey): string {
  switch (by) {
    case 'sector':
      return row.marketSector || UNSET_GROUP_NAME
    case 'market':
      return row.market
    case 'broker':
      return row.brokerName
  }
}

function withRates(
  name: string,
  sums: Omit<BreakdownGroup, 'name' | 'profitLossRate' | 'weight'>,
  totalValue: number,
): BreakdownGroup {
  return {
    name,
    ...sums,
    profitLossRate:
      sums.investmentAmount > 0 ? (sums.profitLoss / sums.investmentAmount) * 100 : 0,
    weight: totalValue > 0 ? (sums.currentValue / totalValue) * 100 : 0,
  }
}

export function breakdownHoldings(
  rows: readonly BreakdownInput[],
  by: BreakdownKey,
): { groups: BreakdownGroup[]; total: BreakdownGroup } {
  const sums = new Map<
    string,
    { stockCount: number; investmentAmount: number; currentValue: number; profitLoss: number }
  >()
  const total = { stockCount: 0, investmentAmount: 0, currentValue: 0, profitLoss: 0 }

  for (const row of rows) {
    const name = groupNameOf(row, by)
    const sum = sums.get(name) ?? {
      stockCount: 0,
      investmentAmount: 0,
      currentValue: 0,
      profitLoss: 0,
    }
    for (const acc of [sum, total]) {
      acc.stockCount += 1
      acc.investmentAmount += row.investmentAmount
      acc.currentValue += row.currentValue
      acc.profitLoss += row.profitLoss
    }
    sums.set(name, sum)
  }

  const groups = [...sums]
    .map(([name, sum]) => withRates(name, sum, total.currentValue))
    .sort((a, b) => b.currentValue - a.currentValue)

  return { groups, total: withRates('合計', total, total.currentValue) }
}

// Yahoo の 11 分類のうち、1 銘柄も保有していないセクター。
// ETF とセクター未入力の銘柄は、どの分類も埋めないものとして数えない。
export function uninvestedSectors(
  rows: readonly Pick<BreakdownInput, 'marketSector'>[],
): string[] {
  const held = new Set(
    rows.map((r) => r.marketSector).filter((s) => s && s !== ETF_SECTOR),
  )
  return YAHOO_SECTORS.filter((s) => !held.has(s))
}
