// 資産推移グラフの期間プリセット（Issue #9）。
//
// 選択肢には性質の異なる 2 種類が混ざっている：
//   - 暦月（今月・先月）… 月の境界で区切る。とくに先月は終点が今日ではなく前月末
//   - 直近 N 年（1年・3年・5年）… 今日を終点に暦年で遡る
//
// 「今日」の判定はサーバーのローカル暦日に依存するため、期間の解決はクライアント
// ではなくサーバー側で行う（クライアントは選択肢の名前だけを送る）。

export type TimelineRange = 'thisMonth' | 'lastMonth' | '1y' | '3y' | '5y' | 'all'

export const TIMELINE_RANGES: ReadonlyArray<{ value: TimelineRange; label: string }> = [
  { value: 'thisMonth', label: '今月' },
  { value: 'lastMonth', label: '先月' },
  { value: '1y', label: '1年' },
  { value: '3y', label: '3年' },
  { value: '5y', label: '5年' },
  { value: 'all', label: '全期間' },
]

const RANGE_VALUES = new Set<string>(TIMELINE_RANGES.map((r) => r.value))

export function isTimelineRange(value: string): value is TimelineRange {
  return RANGE_VALUES.has(value)
}

export interface ResolvedRange {
  start: Date
  end: Date
  // 起点日が期間の終点より後で、描画できるデータが 1 日も無い状態。
  // UI 側で「この期間にはデータがありません」と伝えるために使う。
  isEmpty: boolean
}

// 期間プリセットを実際の日付範囲に解決する。
//
// baselineDate（= 最も古い取引日）より前は保有状況が不明なため描画しない（ADR 0009）。
// そのため start は必ず baselineDate 以降に切り詰める。
export function resolveRange(
  range: TimelineRange,
  today: Date,
  baselineDate: Date,
): ResolvedRange {
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()

  let start: Date
  let end: Date

  switch (range) {
    case 'thisMonth':
      start = new Date(y, m, 1)
      end = new Date(y, m, d)
      break
    case 'lastMonth':
      start = new Date(y, m - 1, 1)
      // 当月 0 日 = 前月末日。月ごとの日数やうるう年を自前で判定しなくて済む
      end = new Date(y, m, 0)
      break
    case 'all':
      start = new Date(baselineDate)
      end = new Date(y, m, d)
      break
    default: {
      const years = Number(range.replace('y', ''))
      start = new Date(y - years, m, d)
      end = new Date(y, m, d)
      break
    }
  }

  // 起点日より前は描かない
  if (start < baselineDate) start = new Date(baselineDate)

  return { start, end, isEmpty: start > end }
}
