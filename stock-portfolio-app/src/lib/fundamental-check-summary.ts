import type { SellItem, SellSignal, SellStatus } from '@/lib/sell-signal'

// 売りの判定（ADR 0023）を、保有銘柄をまたいで数える。
// 基準チェック一覧の件数・絞り込みと、保有一覧の要約バーで使う。
// 判定そのものは sell-signal.ts が出す。ここでは数えるだけで、しきい値は見ない。
//
// 以前は基準チェック（購入時と比べる判定）を数えていたが、判定を売りの判定ひとつに
// 寄せたため、数える対象もそちらに合わせた（ADR 0023）。

const SELL_STATUSES: SellStatus[] = [
  'consider_sell',
  'first_period',
  'ok',
  'no_data',
  'not_applicable',
]

export type SellStatusCounts = Record<SellStatus, number>

export interface TriggeredItemCount {
  key: SellItem['key']
  label: string
  count: number
}

/**
 * その項目が売りの引き金になっているか。
 * 1 期目（前の期より悪化して基準を下回った）と、下回ったまま 2 期目になった状態の両方を含む。
 */
export function isTriggeredItem(item: SellItem): boolean {
  return item.status === 'first_period' || item.status === 'consider_sell'
}

/** 判定ごとの銘柄数。1 件も無い判定も 0 で返し、画面で件数の枠を出せるようにする */
export function countSellStatuses(signals: Pick<SellSignal, 'status'>[]): SellStatusCounts {
  const counts = Object.fromEntries(SELL_STATUSES.map((s) => [s, 0])) as SellStatusCounts
  for (const signal of signals) counts[signal.status] += 1
  return counts
}

/**
 * 引き金になっている項目を、項目ごとに数える。多い順に並べ、同数なら最初に出てきた順。
 * 市場で項目が違う（国内株は自己資本比率も見る）ため、項目の見出しは判定結果に
 * 入っている label をそのまま使う。
 */
export function countTriggeredItems(signals: Pick<SellSignal, 'items'>[]): TriggeredItemCount[] {
  const counts = new Map<SellItem['key'], TriggeredItemCount>()
  for (const signal of signals) {
    for (const item of signal.items) {
      if (!isTriggeredItem(item)) continue
      const found = counts.get(item.key)
      if (found) found.count += 1
      else counts.set(item.key, { key: item.key, label: item.label, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}
