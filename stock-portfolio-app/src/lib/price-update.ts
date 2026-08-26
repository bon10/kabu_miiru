// 価格更新API(/api/prices/update)を呼ぶクライアント共通処理。
// ヘッダーの全体更新・保有一覧の行別更新・銘柄詳細の個別更新から共用する。
//   - stockIds を渡す → その銘柄だけ更新
//   - stockIds を省略 → 保有株数 > 0 の全銘柄を更新

export interface PriceUpdateResultItem {
  stockId: number
  stockName: string
  success: boolean
  error?: string
}

export interface PriceUpdateSummary {
  updatedCount: number
  failedCount: number
  results: PriceUpdateResultItem[]
}

export async function requestPriceUpdate(
  stockIds?: number[]
): Promise<PriceUpdateSummary> {
  const res = await fetch('/api/prices/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stockIds ? { stockIds } : {}),
  })
  if (!res.ok) {
    throw new Error('price update failed')
  }
  const json = await res.json()
  return {
    updatedCount: json.data?.updatedCount ?? 0,
    failedCount: json.data?.failedCount ?? 0,
    results: json.data?.results ?? [],
  }
}
