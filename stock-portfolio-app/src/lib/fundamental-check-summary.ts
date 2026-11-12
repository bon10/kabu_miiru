import type { CheckItem, CheckStatus, FundamentalCheck } from '@/lib/fundamental-check'

// 基準チェック（ADR 0021）の判定を、保有銘柄をまたいで数える。
// 基準チェック一覧の件数・絞り込みと、保有一覧の要約バーで使う。
// 判定そのものは fundamental-check.ts が出す。ここでは数えるだけで、しきい値は見ない。

const CHECK_STATUSES: CheckStatus[] = ['ok', 'broken', 'unmet', 'no_data', 'not_applicable']

export type CheckStatusCounts = Record<CheckStatus, number>

export interface UnmetItemCount {
  key: CheckItem['key']
  label: string
  count: number
}

/**
 * その項目が基準に届いていないか。
 * 基準割れ（買ったときは満たしていた）と購入時から未達の両方を「届いていない」とみなす。
 * 値が無い項目（データなし）は判定できないため含めない。
 */
export function isUnmetItem(item: CheckItem): boolean {
  return item.status === 'broken' || item.status === 'unmet_since_purchase'
}

/** 判定ごとの銘柄数。1 件も無い判定も 0 で返し、画面で件数の枠を出せるようにする */
export function countCheckStatuses(checks: Pick<FundamentalCheck, 'status'>[]): CheckStatusCounts {
  const counts = Object.fromEntries(CHECK_STATUSES.map((s) => [s, 0])) as CheckStatusCounts
  for (const check of checks) counts[check.status] += 1
  return counts
}

/**
 * 基準に届いていない項目を、項目ごとに数える。多い順に並べ、同数なら最初に出てきた順。
 * 市場で項目が違う（米国株は Altman Z、国内株は自己資本比率と有利子負債倍率）ため、
 * 項目の見出しは判定結果に入っている label をそのまま使う。
 */
export function countUnmetItems(checks: Pick<FundamentalCheck, 'items'>[]): UnmetItemCount[] {
  const counts = new Map<CheckItem['key'], UnmetItemCount>()
  for (const check of checks) {
    for (const item of check.items) {
      if (!isUnmetItem(item)) continue
      const found = counts.get(item.key)
      if (found) found.count += 1
      else counts.set(item.key, { key: item.key, label: item.label, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}
