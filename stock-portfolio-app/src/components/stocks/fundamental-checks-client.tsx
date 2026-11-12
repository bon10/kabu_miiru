'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Info } from 'lucide-react'
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
  STATUS_LABEL,
  STATUS_SUMMARY,
  formatCheckValue,
  type FundamentalCheckRow,
} from '@/components/stocks/fundamental-check-card'
import type { CheckItem, CheckStatus } from '@/lib/fundamental-check'
import {
  countCheckStatuses,
  countUnmetItems,
  isUnmetItem,
} from '@/lib/fundamental-check-summary'
import {
  FUNDAMENTAL_CHECK_START_NOTE,
  FUNDAMENTAL_CHECK_NOTE_TEXT,
  formatDate,
  formatDateTime,
} from '@/lib/utils'

// 基準チェック一覧（ADR 0021）。保有銘柄の判定を 1 画面にまとめ、
// どの基準に届いていないかで絞り込めるようにする。
// 銘柄詳細（FundamentalCheckCard）が 1 銘柄の内訳を見せるのに対し、ここは全銘柄の件数と内訳。
// 判定は /api/fundamental-checks が返す。画面では数えて並べるだけで、しきい値は見ない。

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

// 絞り込みの「すべて」。項目のキー（roe など）と区別できる値にする
const ALL = 'all'

// 件数の枠。見直し対象だけ色を付け、ほかは同じ見た目にして目立たせない
const SUMMARY_CARDS: { status: CheckStatus; hint: string; highlight: boolean }[] = [
  {
    status: 'broken',
    hint: '買ったときは満たしていた基準を、今は下回っている銘柄。1 件ずつ開いて、何が変わったか見る。',
    highlight: true,
  },
  {
    status: 'unmet',
    hint: '買った時点で基準に届いていない項目がある銘柄。悪化ではないので、今すぐすることはない。',
    highlight: false,
  },
  {
    status: 'ok',
    hint: 'すべての基準を満たしている銘柄。',
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
  const counts = useMemo(() => countCheckStatuses(rows.map((r) => r.check)), [rows])
  const unmetItems = useMemo(() => countUnmetItems(rows.map((r) => r.check)), [rows])

  // 基準に届いていない項目がある銘柄だけを並べる。見直し対象を先に、次に届いていない項目が多い順
  const listed = useMemo(() => {
    const withUnmet = rows
      .map((row) => ({ row, unmet: row.check.items.filter(isUnmetItem) }))
      .filter((r) => r.unmet.length > 0)
      .filter((r) => itemFilter === ALL || r.unmet.some((i) => i.key === itemFilter))
    return withUnmet.sort((a, b) => {
      const brokenDiff =
        Number(b.row.check.status === 'broken') - Number(a.row.check.status === 'broken')
      if (brokenDiff !== 0) return brokenDiff
      if (b.unmet.length !== a.unmet.length) return b.unmet.length - a.unmet.length
      return a.row.stockName.localeCompare(b.row.stockName, 'ja')
    })
  }, [rows, itemFilter])

  // すべて満たしている銘柄。件数だけだと「どれが満たしているのか」が分からないため、
  // 届いていない銘柄の表とは別の表で名前を出す。並び順は銘柄名順
  const met = useMemo(
    () =>
      rows
        .filter((row) => row.check.status === 'ok')
        .sort((a, b) => a.stockName.localeCompare(b.stockName, 'ja')),
    [rows],
  )

  // 「すべて」の件数。絞り込みを変えても動かないよう、絞り込み前の銘柄数を数える
  const unmetStockCount = useMemo(
    () => rows.filter((row) => row.check.items.some(isUnmetItem)).length,
    [rows],
  )

  // チェック開始日に作った購入時の指標は「その日の値」なので、買ったあとの変化は比べられない
  const checkStartCount = rows.filter((r) => r.snapshot?.isCheckStart).length
  const checkStartDate = rows.find((r) => r.snapshot?.isCheckStart)?.snapshot?.recordedOn ?? null
  const lastPriceUpdate = rows
    .map((r) => r.lastPriceUpdate)
    .filter((v): v is string => v !== null)
    .sort()
    .at(-1)
  const notes = [...new Set(rows.flatMap((r) => r.check.notes))]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">基準チェック</h1>
          <p className="text-muted-foreground">
            保有 {rows.length} 銘柄が、銘柄選びと同じ基準を今も満たしているかを見ています。
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
          {checkStartCount > 0 && (
            <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-blue-900">
                  買ったあとの変化は、まだ比べられない銘柄があります
                </p>
                <p className="text-xs leading-relaxed text-blue-900">
                  {checkStartCount} 銘柄は、比較のもとになる購入時の値が
                  {checkStartDate && `${formatDate(checkStartDate)}（基準チェックを始めた日）`}
                  のものです。{FUNDAMENTAL_CHECK_START_NOTE}
                  この日より前の変化は分からないため、その銘柄が「見直し対象」になるのは、
                  この日より後に基準を下回ったときです。
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SUMMARY_CARDS.map((card) => (
              <Card key={card.status} className={card.highlight ? 'border-amber-500 bg-amber-50' : ''}>
                <CardHeader className="pb-2">
                  <CardTitle
                    className={`text-sm ${card.highlight ? 'text-amber-800' : 'text-muted-foreground'}`}
                  >
                    {STATUS_LABEL[card.status]}
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
            <p className="text-sm text-muted-foreground">{STATUS_SUMMARY.no_data}（{counts.no_data} 件）</p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>基準に届いていない {listed.length} 銘柄</CardTitle>
              <p className="text-sm text-muted-foreground">
                どの基準に届いていないかで絞り込めます。見直し対象を先に、届いていない項目が多い順に並べています。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {unmetItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-sm text-muted-foreground">項目でしぼる</span>
                  <Button
                    variant={itemFilter === ALL ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setItemFilter(ALL)}
                  >
                    すべて {unmetStockCount}
                  </Button>
                  {unmetItems.map((item) => (
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
                    <TableHead>届いていない基準（今の値）</TableHead>
                    <TableHead className="text-right">数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listed.map(({ row, unmet }) => (
                    <TableRow key={row.stockId}>
                      <TableCell className="min-w-[12rem] align-top">
                        <span className="flex items-center gap-2">
                          <FundamentalStatusIcon status={row.check.status} />
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
                      </TableCell>
                      <TableCell className="align-top">
                        <span className="flex flex-wrap gap-1.5">
                          {unmet.map((item: CheckItem) => (
                            <span
                              key={item.key}
                              className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {item.label} {formatCheckValue(item, item.current)}
                            </span>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell className="align-top text-right">{unmet.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                {notes.map((note) => (
                  <p key={note}>{FUNDAMENTAL_CHECK_NOTE_TEXT[note]}</p>
                ))}
                <p>
                  財務の値は直近の通期決算のものです。業績の悪化が判定に出るのは次の通期決算が載ってからで、
                  急な悪化には気づけません。200日線は株価で毎日動きます。売買を勧めるものではありません。
                </p>
              </div>
            </CardContent>
          </Card>

          {met.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>すべての基準を満たしている {met.length} 銘柄</CardTitle>
                <p className="text-sm text-muted-foreground">{STATUS_SUMMARY.ok}</p>
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
                    {met.map((row) => (
                      <TableRow key={row.stockId}>
                        <TableCell className="min-w-[12rem]">
                          <span className="flex items-center gap-2">
                            <FundamentalStatusIcon status={row.check.status} />
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
