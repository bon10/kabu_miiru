// 保有一覧の絞り込み（市場・セクター）。
//
// 絞り込みは API（/api/holdings/by-broker）側で行う。画面だけで絞ると、
// サマリカードや証券会社ごとの合計が絞り込み前の数字のまま残るため。

// セクターが未入力の銘柄を選ぶための値。実在のセクター名と衝突しない文字列にする。
export const UNSET_SECTOR = '__unset__'

export interface HoldingFilter {
  market?: string
  sector?: string
}

interface FilterableStock {
  market: string
  marketSector: string | null
}

export function matchesHoldingFilter(
  stock: FilterableStock,
  filter: HoldingFilter
): boolean {
  if (filter.market && stock.market !== filter.market) return false
  if (filter.sector) {
    const sector = stock.marketSector || null
    if (filter.sector === UNSET_SECTOR) return sector === null
    return sector === filter.sector
  }
  return true
}

// 絞り込みの選択肢。実在する値だけを出し、選んでも 0 件になる項目を作らない。
// 未入力のセクターは sectors に入れず hasUnsetSector で表す（画面で「未設定」と出すため）。
export function holdingFilterOptions(stocks: readonly FilterableStock[]): {
  markets: string[]
  sectors: string[]
  hasUnsetSector: boolean
} {
  const collator = new Intl.Collator('ja')
  const markets = new Set<string>()
  const sectors = new Set<string>()
  let hasUnsetSector = false

  for (const s of stocks) {
    markets.add(s.market)
    if (s.marketSector) sectors.add(s.marketSector)
    else hasUnsetSector = true
  }

  return {
    markets: [...markets].sort(collator.compare),
    sectors: [...sectors].sort(collator.compare),
    hasUnsetSector,
  }
}
