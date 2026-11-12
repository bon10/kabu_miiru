'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  formatDate,
  formatDateTime,
} from '@/lib/utils'

// 基準チェック（ADR 0021）の表示。銘柄詳細の欄と、保有一覧の印で使う。
// 判定は /api/fundamental-checks が返す。画面では並べるだけで計算しない。

export interface FundamentalCheckRow {
  stockId: number
  market: string
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

// 保有一覧の印。基準割れの銘柄だけに出し、詳しくは銘柄詳細で見てもらう
export function FundamentalBrokenBadge({ status }: { status: CheckStatus | undefined }) {
  if (status !== 'broken') return null
  return (
    <Badge
      variant="outline"
      className="border-amber-500 text-amber-700 whitespace-nowrap"
      title="買ったときは満たしていた基準を、今は下回っています。銘柄詳細の「基準チェック」で確認できます"
    >
      基準割れ
    </Badge>
  )
}

const STATUS_SUMMARY: Record<CheckStatus, string> = {
  ok: 'すべての基準を満たしています。',
  broken: '買ったときは満たしていた基準を、今は下回っている項目があります。売りを検討するサインです。',
  unmet: '買ったときから基準に届いていない項目があります（買ったあとに悪くなったものはありません）。',
  no_data: '財務の値がまだ取れていません。価格更新をすると取得します。',
  not_applicable: 'ETF は財務の値が無いため、基準チェックの対象外です。',
}

const ITEM_STATUS: Record<CheckItemStatus, { label: string; className: string }> = {
  ok: { label: '満たしている', className: 'text-green-700' },
  broken: { label: '基準割れ', className: 'text-amber-700 font-semibold' },
  unmet_since_purchase: { label: '購入時から未達', className: 'text-muted-foreground' },
  no_data: { label: 'データなし', className: 'text-muted-foreground' },
}

function formatValue(item: CheckItem, value: number | null): string {
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
        <CardTitle>基準チェック</CardTitle>
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
                      <TableCell className="whitespace-nowrap">{item.label}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.thresholdLabel}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{formatValue(item, item.current)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{formatValue(item, item.purchase)}</TableCell>
                      <TableCell className={`whitespace-nowrap ${ITEM_STATUS[item.status].className}`}>
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
