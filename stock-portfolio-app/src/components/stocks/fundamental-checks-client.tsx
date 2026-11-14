'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FundamentalStatusIcon,
  SELL_STATUS_LABEL,
  SELL_STATUS_SUMMARY,
  formatCheckValue,
  sellBadgeClassName,
  type FundamentalCheckRow,
} from '@/components/stocks/fundamental-check-card'
import type { SellItem, SellStatus } from '@/lib/sell-signal'
import {
  countSellStatuses,
  countTriggeredItems,
  isTriggeredItem,
} from '@/lib/fundamental-check-summary'
import { FUNDAMENTAL_CHECK_NOTE_TEXT, formatDate, formatDateTime } from '@/lib/utils'

// 基準チェック一覧。保有銘柄の判定を 1 画面にまとめ、どの項目が引き金かで絞り込めるようにする。
// 銘柄詳細（FundamentalCheckCard）が 1 銘柄の内訳を見せるのに対し、ここは全銘柄の件数と内訳。
//
// **銘柄の判定は売りの判定（ADR 0023）ひとつ。** 購入時と比べる判定は銘柄の判定としては
// 使わない（判定が 2 つあると、どちらに従えばよいか分からなくなるため）。
// 判定は /api/fundamental-checks が返す。画面では数えて並べるだけで、しきい値は見ない。

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

// 絞り込みの「すべて」。項目のキー（roe など）と区別できる値にする
const ALL = 'all'

// 件数の枠。売りを検討だけ色を付け、ほかは同じ見た目にして目立たせない
const SUMMARY_CARDS: { status: SellStatus; hint: string; highlight: boolean }[] = [
  {
    status: 'consider_sell',
    hint: '稼ぐ力か財務が、前の年より悪くなって基準を下回った状態が 2 期続いている銘柄。1 件ずつ開いて、何が変わったか見る。',
    highlight: true,
  },
  {
    status: 'first_period',
    hint: '悪くなった 1 期目の銘柄。次の決算でも戻らなければ検討対象になる。今すぐすることはない。',
    highlight: false,
  },
  {
    status: 'ok',
    hint: '売りを考える材料が無い銘柄。基準を下回っていても、前の年より良くなっているならここに入る。',
    highlight: false,
  },
  {
    status: 'not_applicable',
    hint: 'ETF は財務の値が無いため判定しない。',
    highlight: false,
  },
]

export default function FundamentalChecksClient() {
  const { data, error } = useSWR<{ data: FundamentalCheckRow[] }>(
    '/api/fundamental-checks',
    fetcher,
  )
  const [itemFilter, setItemFilter] = useState<string>(ALL)

  const rows = useMemo(() => data?.data ?? [], [data])
  const counts = useMemo(() => countSellStatuses(rows.map((r) => r.sell)), [rows])
  const triggeredItems = useMemo(() => countTriggeredItems(rows.map((r) => r.sell)), [rows])

  // 引き金が付いた銘柄だけを並べる。売りを検討を先に、次に引き金の数が多い順
  const listed = useMemo(() => {
    const withTrigger = rows
      .map((row) => ({ row, triggered: row.sell.items.filter(isTriggeredItem) }))
      .filter((r) => r.triggered.length > 0)
      .filter((r) => itemFilter === ALL || r.triggered.some((i) => i.key === itemFilter))
    return withTrigger.sort((a, b) => {
      const considerDiff =
        Number(b.row.sell.status === 'consider_sell') - Number(a.row.sell.status === 'consider_sell')
      if (considerDiff !== 0) return considerDiff
      if (b.triggered.length !== a.triggered.length) return b.triggered.length - a.triggered.length
      return a.row.stockName.localeCompare(b.row.stockName, 'ja')
    })
  }, [rows, itemFilter])

  // 引き金が無い銘柄。件数だけだと「どれが落ち着いているのか」が分からないため、
  // 引き金が付いた銘柄の表とは別の表で名前を出す。並び順は銘柄名順
  const calm = useMemo(
    () =>
      rows
        .filter((row) => row.sell.status === 'ok')
        .sort((a, b) => a.stockName.localeCompare(b.stockName, 'ja')),
    [rows],
  )

  // 「すべて」の件数。絞り込みを変えても動かないよう、絞り込み前の銘柄数を数える
  const triggeredStockCount = useMemo(
    () => rows.filter((row) => row.sell.items.some(isTriggeredItem)).length,
    [rows],
  )

  const lastPriceUpdate = rows
    .map((r) => r.lastPriceUpdate)
    .filter((v): v is string => v !== null)
    .sort()
    .at(-1)
  const notes = [...new Set(rows.flatMap((r) => r.values.notes))]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">基準チェック</h1>
          <p className="text-muted-foreground">
            保有 {rows.length} 銘柄の稼ぐ力と財務を、前の年の決算と比べています。
          </p>
        </div>
        {lastPriceUpdate && (
          <p className="text-sm text-muted-foreground">
            価格の最終更新 {formatDateTime(lastPriceUpdate)}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">基準チェックを読み込めませんでした。</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">読み込み中...</p>}

      {data && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">保有中の銘柄がありません。</p>
      )}

      {data && rows.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SUMMARY_CARDS.map((card) => (
              <Card key={card.status} className={card.highlight ? 'border-amber-500 bg-amber-50' : ''}>
                <CardHeader className="pb-2">
                  <CardTitle
                    className={`text-sm ${card.highlight ? 'text-amber-800' : 'text-muted-foreground'}`}
                  >
                    {SELL_STATUS_LABEL[card.status]}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className={`text-3xl font-bold ${card.highlight ? 'text-amber-800' : ''}`}>
                    {counts[card.status]}
                    <span className="ml-1 text-sm font-medium"> 件</span>
                  </p>
                  <p className={`text-xs leading-relaxed ${card.highlight ? 'text-amber-900' : 'text-muted-foreground'}`}>
                    {card.hint}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {counts.no_data > 0 && (
            <p className="text-sm text-muted-foreground">
              {SELL_STATUS_SUMMARY.no_data}（{counts.no_data} 件）
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>悪くなった項目がある {listed.length} 銘柄</CardTitle>
              <p className="text-sm text-muted-foreground">
                どの項目が引き金かで絞り込めます。売りを検討を先に、引き金の数が多い順に並べています。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {triggeredItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-sm text-muted-foreground">項目でしぼる</span>
                  <Button
                    variant={itemFilter === ALL ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setItemFilter(ALL)}
                  >
                    すべて {triggeredStockCount}
                  </Button>
                  {triggeredItems.map((item) => (
                    <Button
                      key={item.key}
                      variant={itemFilter === item.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setItemFilter(item.key)}
                    >
                      {item.label} {item.count}
                    </Button>
                  ))}
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>銘柄</TableHead>
                    <TableHead>市場</TableHead>
                    <TableHead>判定</TableHead>
                    <TableHead>悪くなった項目（直近期 ← 前の期）</TableHead>
                    <TableHead>1 期目</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listed.map(({ row, triggered }) => (
                    <TableRow key={row.stockId}>
                      <TableCell className="min-w-[12rem] align-top">
                        <span className="flex items-center gap-2">
                          <FundamentalStatusIcon status={row.sell.status} />
                          <Link href={`/stocks/${row.stockId}`} className="font-medium hover:underline">
                            {row.stockName}
                          </Link>
                          <span className="text-xs text-muted-foreground">{row.code}</span>
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap align-top text-muted-foreground">
                        {row.market}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="outline" className={sellBadgeClassName(row.sell.status)}>
                          {SELL_STATUS_LABEL[row.sell.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <span className="flex flex-wrap gap-1.5">
                          {triggered.map((item: SellItem) => (
                            <span
                              key={item.key}
                              className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {item.label} {formatCheckValue(item.key, item.latest)} ←{' '}
                              {formatCheckValue(item.key, item.previous)}
                            </span>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap align-top text-muted-foreground">
                        {triggered[0]?.firstPeriodEnd ? formatDate(triggered[0].firstPeriodEnd) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                {notes.map((note) => (
                  <p key={note}>{FUNDAMENTAL_CHECK_NOTE_TEXT[note]}</p>
                ))}
                <p>
                  判定は ROE・自己資本比率・有利子負債倍率を前の通期決算と比べたものです。
                  FCF利回り・Altman Z・200日線は株価でも動くため、売りの判定には使いません。
                  業績の悪化が判定に出るのは次の通期決算が載ってからで、急な悪化には気づけません。
                  売買を勧めるものではありません。
                </p>
              </div>
            </CardContent>
          </Card>

          {calm.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>引き金が無い {calm.length} 銘柄</CardTitle>
                <p className="text-sm text-muted-foreground">{SELL_STATUS_SUMMARY.ok}</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>銘柄</TableHead>
                      <TableHead>市場</TableHead>
                      <TableHead>セクター</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calm.map((row) => (
                      <TableRow key={row.stockId}>
                        <TableCell className="min-w-[12rem]">
                          <span className="flex items-center gap-2">
                            <FundamentalStatusIcon status={row.sell.status} />
                            <Link
                              href={`/stocks/${row.stockId}`}
                              className="font-medium hover:underline"
                            >
                              {row.stockName}
                            </Link>
                            <span className="text-xs text-muted-foreground">{row.code}</span>
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {row.market}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.marketSector ?? '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
