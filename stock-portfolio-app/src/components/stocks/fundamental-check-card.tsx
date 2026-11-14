'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CriterionKey, FundamentalValues } from '@/lib/fundamental-check'
import type { SellSignal, SellStatus } from '@/lib/sell-signal'
import {
  FUNDAMENTAL_CHECK_START_NOTE,
  FUNDAMENTAL_CHECK_NOTE_TEXT,
  FUNDAMENTAL_CRITERION_HINT,
  formatDate,
  formatDateTime,
} from '@/lib/utils'

// 基準チェックの表示。銘柄詳細の欄、基準チェック一覧、保有一覧の要約バーで使う。
//
// **銘柄の判定は売りの判定（ADR 0023）ひとつ。** 以前は購入時と比べる判定
// （見直し対象・購入時から未達）も銘柄の判定として出していたが、判定が 2 つあると
// どちらに従えばよいか分からなくなるため、売りの判定に寄せた。
// 項目ごとの表は「今の値が基準を満たすか」という事実だけを出し、購入時の値は
// 比べるための数字として並べる。
//
// 判定は /api/fundamental-checks が返す。画面では並べるだけで計算しない。

export interface FundamentalCheckRow {
  stockId: number
  stockName: string
  code: string
  market: string
  marketSector: string | null
  lastPriceUpdate: string | null
  fiscalPeriodEnd: string | null
  fundamentalFetchedAt: string | null
  snapshot: { recordedOn: string; isCheckStart: boolean } | null
  values: FundamentalValues
  sell: SellSignal
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

// 銘柄の判定ごとに「どういう状態か」と「次にすること」を 1 文で出す。
// 売りを検討は売りの指示ではなく、持ち続けるかを考え直すきっかけ（ADR 0023）。
export const SELL_STATUS_SUMMARY: Record<SellStatus, string> = {
  consider_sell:
    '稼ぐ力か財務の安全性が、前の年より悪くなって基準を下回り、その次の期も基準を下回ったままです。この銘柄を持ち続けるか、もう一度考えるきっかけです。',
  first_period:
    '稼ぐ力か財務の安全性が、前の年より悪くなって基準を下回りました。1 期目なので、次の決算でも戻らなければ考えるきっかけになります。今すぐすることはありません。',
  ok: '売りを考える材料はありません。基準を下回っている項目があっても、前の年より良くなっているなら引き金になりません。今はすることはありません。',
  no_data:
    '比べる前の年の決算がまだありません。ヘッダーの「価格更新」を押すと通期決算を取りに行きます。',
  not_applicable: 'ETF は財務の値が無いため、売りの判定の対象外です。',
}

// 銘柄の判定につける短い見出し。一覧の行と銘柄詳細で同じ言葉を使う
export const SELL_STATUS_LABEL: Record<SellStatus, string> = {
  consider_sell: '売りを検討',
  first_period: '1 期目',
  ok: '引き金なし',
  no_data: '判定できない',
  not_applicable: '対象外',
}

// 気づいてほしい判定にだけ色を付ける
export function sellBadgeClassName(status: SellStatus): string {
  if (status === 'consider_sell') return 'border-amber-500 text-amber-700 whitespace-nowrap'
  if (status === 'first_period') return 'border-muted-foreground text-foreground whitespace-nowrap'
  return 'text-muted-foreground whitespace-nowrap'
}

// 行の先頭に出す丸い印。基準チェック一覧の表で使う。
//   - 売りを検討：気づけるようオレンジの丸
//   - 引き金なし：どの銘柄が落ち着いているかを一覧で分かるよう、青い丸
//   - 1 期目・判定できない・対象外：印を出さない（表の判定の列に文字で出る）
//
// 印が無い判定でも同じ大きさの空きを返す。銘柄名より前に置くため、印の有無で名前の位置が
// ずれないようにする。色と形だけで意味を伝えないよう、ツールチップで意味と次にすることを
// 出し、読み上げ用の文も持たせる。キーボードでも読めるよう、印はボタンにしてフォーカスできる。
// 引き金なしを緑にしないのは、評価損益のプラス（緑）と見分けられなくなるため。
const STATUS_ICON: Partial<
  Record<SellStatus, { icon: typeof CircleCheck; className: string; label: string; text: string }>
> = {
  ok: {
    icon: CircleCheck,
    className: 'text-blue-600',
    label: '引き金なし',
    text: SELL_STATUS_SUMMARY.ok,
  },
  consider_sell: {
    icon: CircleAlert,
    className: 'text-amber-600',
    label: '売りを検討',
    text: SELL_STATUS_SUMMARY.consider_sell,
  },
}

export function FundamentalStatusIcon({ status }: { status: SellStatus | undefined }) {
  const mark = status ? STATUS_ICON[status] : undefined
  if (!mark) return <span className="inline-block h-4 w-4 shrink-0" aria-hidden="true" />

  const Icon = mark.icon
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Icon className={`h-4 w-4 ${mark.className}`} aria-hidden="true" />
          <span className="sr-only">{mark.label}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-semibold">{mark.label}</p>
          <p>{mark.text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// 項目ごとに「今、基準を満たすか」。銘柄の判定ではないので、次にすることは書かない
const MEETS_LABEL = {
  yes: { label: '満たしている', className: 'text-green-700' },
  no: { label: '満たしていない', className: 'text-amber-700' },
  unknown: { label: 'データなし', className: 'text-muted-foreground' },
} as const

function meetsOf(meetsNow: boolean | null) {
  return meetsNow === null ? MEETS_LABEL.unknown : meetsNow ? MEETS_LABEL.yes : MEETS_LABEL.no
}

// 売りの判定に使う項目かどうか。使わない項目（FCF利回り・Altman Z・200日線）は株価でも
// 動くため、売りの引き金にしない（ADR 0023）。表でその違いが分かるように印を出す
const SELL_TRIGGER_KEYS: CriterionKey[] = ['roe', 'equityRatio', 'debtToEquity']

// 項目ごとの判定（売りの判定の内訳）
const SELL_ITEM_LABEL = {
  ok: '引き金なし',
  first_period: '1 期目',
  consider_sell: '下回ったまま 2 期目',
  no_data: 'データなし',
} as const

// 基準チェックの値の表示。比率はパーセント、Altman Z は倍率、200日線は「200日線から何 % 上か」
export function formatCheckValue(key: CriterionKey, value: number | null, digits = 1): string {
  if (value === null) return '-'
  if (key === 'altmanZ') return value.toFixed(digits + 1)
  if (key === 'trend') return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
  return `${value.toFixed(digits)}%`
}

/**
 * 「前の期 → その期」の 2 つの値を並べて書く。
 *
 * 小数 1 桁では差が見えないことがある（29.14% と 29.09% はどちらも 29.1%）。
 * 同じ文字列になるときは桁を増やし、悪化していることが読めるようにする。
 */
export function formatCheckChange(
  key: CriterionKey,
  from: number | null,
  to: number | null,
): string {
  for (const digits of [1, 2, 3]) {
    const a = formatCheckValue(key, from, digits)
    const b = formatCheckValue(key, to, digits)
    if (a !== b || from === to || from === null || to === null) return `${a} → ${b}`
  }
  return `${formatCheckValue(key, from, 3)} → ${formatCheckValue(key, to, 3)}`
}

export function FundamentalCheckCard({
  stockId,
  version,
}: {
  stockId: number
  // 価格更新などで値が変わったときに取り直すための値（最終価格更新日時など）
  version?: string
}) {
  const { data, error, mutate } = useSWR<{ data: FundamentalCheckRow[] }>(
    `/api/fundamental-checks?stockId=${stockId}`,
    fetcher,
  )
  useEffect(() => {
    mutate()
  }, [version, mutate])

  const row = data?.data[0]
  const triggered =
    row?.sell.status === 'consider_sell' || row?.sell.status === 'first_period'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          基準チェック
          {row && (
            <Badge variant="outline" className={sellBadgeClassName(row.sell.status)}>
              {SELL_STATUS_LABEL[row.sell.status]}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-600">基準チェックを読み込めませんでした。</p>}
        {!data && !error && <p className="text-sm text-muted-foreground">読み込み中...</p>}
        {data && !row && (
          <p className="text-sm text-muted-foreground">保有していない銘柄は基準チェックの対象外です。</p>
        )}
        {row && (
          <>
            <p className={row.sell.status === 'consider_sell' ? 'text-sm font-semibold text-amber-700' : 'text-sm'}>
              {SELL_STATUS_SUMMARY[row.sell.status]}
            </p>

            {row.values.items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>項目</TableHead>
                    <TableHead>基準</TableHead>
                    <TableHead className="text-right">今</TableHead>
                    <TableHead className="text-right">購入時</TableHead>
                    <TableHead>今の状態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {row.values.items.map((item) => {
                    const meets = meetsOf(item.meetsNow)
                    return (
                      <TableRow key={item.key}>
                        <TableCell className="min-w-[14rem] align-top">
                          <p className="whitespace-nowrap">
                            {item.label}
                            {!SELL_TRIGGER_KEYS.includes(item.key) && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                売りの判定に使わない
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {FUNDAMENTAL_CRITERION_HINT[item.key]}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap align-top">{item.thresholdLabel}</TableCell>
                        <TableCell className="whitespace-nowrap text-right align-top">{formatCheckValue(item.key, item.current)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right align-top">{formatCheckValue(item.key, item.purchase)}</TableCell>
                        <TableCell className={`whitespace-nowrap align-top ${meets.className}`}>
                          {meets.label}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}

            {triggered && row.sell.items.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">売りの判定の内訳（前の期と比べる）</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>項目</TableHead>
                      <TableHead>基準</TableHead>
                      <TableHead className="text-right">悪化した期（前の期 → その期）</TableHead>
                      <TableHead className="text-right">直近期</TableHead>
                      <TableHead>判定</TableHead>
                      <TableHead>1 期目</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {row.sell.items.map((item) => (
                      <TableRow key={item.key}>
                        <TableCell className="whitespace-nowrap">{item.label}</TableCell>
                        <TableCell className="whitespace-nowrap">{item.thresholdLabel}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          {item.firstPeriodEnd
                            ? formatCheckChange(item.key, item.firstPeriodPrevious, item.firstPeriodValue)
                            : '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">{formatCheckValue(item.key, item.latest)}</TableCell>
                        <TableCell
                          className={`whitespace-nowrap ${item.status === 'consider_sell' ? 'text-amber-700 font-semibold' : item.status === 'first_period' ? 'text-amber-700' : 'text-muted-foreground'}`}
                        >
                          {SELL_ITEM_LABEL[item.status]}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {item.firstPeriodEnd ? formatDate(item.firstPeriodEnd) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
              {row.values.notes.map((note) => (
                <p key={note}>{FUNDAMENTAL_CHECK_NOTE_TEXT[note]}</p>
              ))}
              {row.snapshot && (
                <p>
                  購入時の値：{formatDate(row.snapshot.recordedOn)} 時点
                  {row.snapshot.isCheckStart && `。${FUNDAMENTAL_CHECK_START_NOTE}`}
                  比べるための数字で、判定には使いません。
                </p>
              )}
              {row.fiscalPeriodEnd && (
                <p>
                  財務の値：{formatDate(row.fiscalPeriodEnd)} 期末の通期決算（
                  {row.fundamentalFetchedAt && `${formatDateTime(row.fundamentalFetchedAt)} 取得`}）。
                  今の値は最後に価格更新した時点の株価
                  {row.lastPriceUpdate && `（${formatDateTime(row.lastPriceUpdate)}）`}で計算しています。
                </p>
              )}
              <p>
                基準は銘柄選びのスキルと同じ固定値です。200日線は「200日線から何 % 上か」を表します。
                売りの判定は ROE・自己資本比率・有利子負債倍率を前の期と比べたもので、株価で動く項目は使いません。
                「悪化した期」は引き金になった決算期の値です。そのあと少し戻していても、基準を下回ったままなら判定は続きます。売買を勧めるものではありません。
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
