// 保有一覧テーブルのソート。
//
// 並べ替えの対象は「円換算済みの金額」と「通貨に依存しない値」だけにする。
// 平均取得単価・現在価格は建値通貨のまま表示する列で（ADR 0005）、同じ列に
// ドル建てと円建てが並ぶため、数値の大小が金額の大小を表さない。$300 の米国株が
// ￥1,000 の国内株より小さく並んでしまうので、ソート対象から外している。

export type HoldingSortKey =
  | 'stockName'
  | 'market'
  | 'sharesHeld'
  | 'investmentAmount'
  | 'currentValue'
  | 'profitLoss'
  | 'ytdDividend'

export type SortDirection = 'asc' | 'desc'

export interface HoldingSort {
  key: HoldingSortKey
  direction: SortDirection
}

// ソートに必要な項目だけを要求する。テーブルの行はこれ以外の項目も持つ。
export interface SortableHolding {
  stockName: string
  market: string
  sharesHeld: number
  investmentAmount: number
  currentValue: number
  profitLoss: number
  ytdDividend: number
}

// 文字列として比較する列。これ以外は数値として比較する。
const TEXT_SORT_KEYS = ['stockName', 'market'] as const
type TextSortKey = (typeof TEXT_SORT_KEYS)[number]

function isTextSortKey(key: HoldingSortKey): key is TextSortKey {
  return (TEXT_SORT_KEYS as readonly string[]).includes(key)
}

// 銘柄名の照合は日本語で固定する。実行環境の既定ロケールに任せると、
// サーバーやブラウザの設定で並びが変わるため。
// なお漢字は読み（かな）ではなく照合順で並ぶので、「任天堂」は「に」の位置には来ない。
const NAME_COLLATOR = new Intl.Collator('ja')

// 2 行の大小を返す。指定列の値が等しいときは銘柄名の昇順で決める。
// 入力順（証券会社別はサーバーの銘柄名順、フラットは平坦化した順）に
// 並びが左右されないようにするため。
export function compareHoldings(
  a: SortableHolding,
  b: SortableHolding,
  sort: HoldingSort
): number {
  const sign = sort.direction === 'asc' ? 1 : -1

  const diff = isTextSortKey(sort.key)
    ? NAME_COLLATOR.compare(a[sort.key], b[sort.key])
    : a[sort.key] - b[sort.key]
  if (diff !== 0) return diff * sign

  // 市場や金額が同じ行は銘柄名の昇順で決める。
  // 銘柄名そのもので並べている場合は差が無い＝同名なので 0 になる。
  return NAME_COLLATOR.compare(a.stockName, b.stockName)
}

// 並べ替えた新しい配列を返す。SWR が持つ配列を書き換えないよう、必ず複製してから並べる。
export function sortHoldings<T extends SortableHolding>(
  rows: readonly T[],
  sort: HoldingSort
): T[] {
  return [...rows].sort((a, b) => compareHoldings(a, b, sort))
}

// 見出しを押したときの次のソート状態。
// 同じ列なら向きを反転し、別の列なら「その列を最初に見るときの向き」から始める。
// 金額・株数は大きい順に見たいことが多いので降順、銘柄名・市場は昇順を初期値にする。
export function nextHoldingSort(
  current: HoldingSort,
  key: HoldingSortKey
): HoldingSort {
  if (current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { key, direction: isTextSortKey(key) ? 'asc' : 'desc' }
}
