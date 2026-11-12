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
import type {
  CheckItem,
  CheckItemStatus,
  CheckStatus,
  FundamentalCheck,
} from '@/lib/fundamental-check'
import {
  FUNDAMENTAL_CHECK_START_NOTE,
  FUNDAMENTAL_CHECK_NOTE_TEXT,
  FUNDAMENTAL_CRITERION_HINT,
  formatDate,
  formatDateTime,
} from '@/lib/utils'

// 基準チェック（ADR 0021）の表示。銘柄詳細の欄、保有一覧の印、基準チェック一覧で使う。
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
  check: FundamentalCheck
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

// 行の先頭に出す丸い印。判定ごとに出し分ける。
//   - 満たしている（ok）：どの銘柄が基準を満たしているかを一覧で分かるよう、青い丸
//   - 見直し対象（broken）：買ったあとに基準を下回ったので、気づけるようオレンジの丸
//   - 購入時から未達・データなし・対象外：印を出さない。購入時から未達は保有銘柄の多くが
//     該当しうるため、出すと上の 2 つが埋もれる。件数は要約バー、内訳は基準チェック一覧で見る
//
// 印が無い判定でも同じ大きさの空きを返す。銘柄名より前に置くため、印の有無で名前の位置が
// ずれないようにする。
// 色と形だけで意味を伝えないよう、ツールチップで意味と次にすることを出し、
// 読み上げ用の文も持たせる。キーボードでも読めるよう、印はボタンにしてフォーカスできる。
// 満たしているを緑にしないのは、同じ行の評価損益のプラス（緑）と見分けられなくなるため。
const STATUS_ICON: Partial<
  Record<CheckStatus, { icon: typeof CircleCheck; className: string; label: string; text: string }>
> = {
  ok: {
    icon: CircleCheck,
    className: 'text-blue-600',
    label: '基準を満たしている',
    text: 'ROE・FCF利回り・財務の安全性・200日線のすべてが基準を満たしています。今はすることはありません。',
  },
  broken: {
    icon: CircleAlert,
    className: 'text-amber-600',
    label: '見直し対象',
    text: '買ったときは満たしていた基準を、今は下回っています。この銘柄を持ち続けるか、もう一度考えるきっかけです。銘柄詳細の「基準チェック」で項目ごとに見られます。',
  },
}

export function FundamentalStatusIcon({ status }: { status: CheckStatus | undefined }) {
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

// 銘柄名のうしろに出す「見直し対象」のバッジ。丸い印だけだと見落とすため、
// 買ったあとに基準を下回った銘柄には文字でも出す。
export function FundamentalBrokenBadge({ status }: { status: CheckStatus | undefined }) {
  if (status !== 'broken') return null
  return (
    <Badge variant="outline" className="border-amber-500 text-amber-700 whitespace-nowrap">
      見直し対象
    </Badge>
  )
}

// 判定ごとに「どういう状態か」と「次にすること」を 1 文で出す。
// 基準割れは売りの指示ではなく、持ち続けるかを考え直すきっかけ（ADR 0021）。
export const STATUS_SUMMARY: Record<CheckStatus, string> = {
  ok: 'すべての基準を満たしています。今はすることはありません。',
  broken:
    '買ったときは満たしていた基準を、今は下回っています。この銘柄を持ち続けるか、もう一度考えるきっかけです。',
  unmet:
    '買った時点で基準に届いていない項目があります。買ったあとに悪くなったものはないので、今すぐすることはありません。',
  no_data: '財務の値がまだありません。ヘッダーの「価格更新」を押すと取りに行きます。',
  not_applicable: 'ETF は財務の値が無いため、基準チェックの対象外です。',
}

// 銘柄の判定（STATUS_SUMMARY）につける短い見出し。一覧の行と銘柄詳細で同じ言葉を使う。
export const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: '満たしている',
  broken: '見直し対象',
  unmet: '購入時から未達',
  no_data: 'データなし',
  not_applicable: '対象外',
}

// 項目ごとの判定。銘柄の判定（STATUS_LABEL）が「次にすること」を表すのに対し、
// ここは「その項目に何が起きたか」を表す
const ITEM_STATUS: Record<CheckItemStatus, { label: string; className: string }> = {
  ok: { label: '満たしている', className: 'text-green-700' },
  broken: { label: '買ったあとに下回った', className: 'text-amber-700 font-semibold' },
  unmet_since_purchase: { label: '購入時から未達', className: 'text-muted-foreground' },
  no_data: { label: 'データなし', className: 'text-muted-foreground' },
}

// 基準チェックの値の表示。比率はパーセント、Altman Z は倍率、200日線は「200日線から何 % 上か」
export function formatCheckValue(item: CheckItem, value: number | null): string {
  if (value === null) return '-'
  if (item.key === 'altmanZ') return value.toFixed(2)
  // 200日線は「200日線から何 % 上か」
  if (item.key === 'trend') return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  return `${value.toFixed(1)}%`
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          基準チェック
          {row && (
            <Badge
              variant="outline"
              className={
                row.check.status === 'broken'
                  ? 'border-amber-500 text-amber-700 whitespace-nowrap'
                  : 'text-muted-foreground whitespace-nowrap'
              }
            >
              {STATUS_LABEL[row.check.status]}
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
            <p className={row.check.status === 'broken' ? 'text-sm font-semibold text-amber-700' : 'text-sm'}>
              {STATUS_SUMMARY[row.check.status]}
            </p>

            {row.check.items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>項目</TableHead>
                    <TableHead>基準</TableHead>
                    <TableHead className="text-right">今</TableHead>
                    <TableHead className="text-right">購入時</TableHead>
                    <TableHead>判定</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {row.check.items.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="min-w-[14rem] align-top">
                        <p className="whitespace-nowrap">{item.label}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {FUNDAMENTAL_CRITERION_HINT[item.key]}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap align-top">{item.thresholdLabel}</TableCell>
                      <TableCell className="whitespace-nowrap text-right align-top">{formatCheckValue(item, item.current)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right align-top">{formatCheckValue(item, item.purchase)}</TableCell>
                      <TableCell className={`whitespace-nowrap align-top ${ITEM_STATUS[item.status].className}`}>
                        {ITEM_STATUS[item.status].label}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
              {row.check.notes.map((note) => (
                <p key={note}>{FUNDAMENTAL_CHECK_NOTE_TEXT[note]}</p>
              ))}
              {row.snapshot && (
                <p>
                  購入時の値：{formatDate(row.snapshot.recordedOn)} 時点
                  {row.snapshot.isCheckStart && `。${FUNDAMENTAL_CHECK_START_NOTE}`}
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
                基準は銘柄選びのスキルと同じ固定値です。200日線は「200日線から何 % 上か」を表します。売買を勧めるものではありません。
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
