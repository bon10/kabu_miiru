'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { TIMELINE_RANGES, type TimelineRange } from '@/lib/timeline-range'

interface TimelinePoint {
  date: string
  marketValue: number
  investedPrincipal: number
  unrealizedPL: number
  cumulativeRealizedPL: number
  cumulativeDividends: number
  filledStockCount: number
}

interface TimelineResponse {
  data: {
    points: TimelinePoint[]
    baselineDate: string | null
    missingPriceStocks: Array<{ code: string; stockName: string }>
  }
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

export default function PortfolioTimelineChart() {
  const [range, setRange] = useState<TimelineRange>('1y')

  const { data, isLoading } = useSWR<TimelineResponse>(
    `/api/portfolio/timeline?range=${range}`,
    fetcher,
  )

  const points = data?.data.points ?? []
  const baselineDate = data?.data.baselineDate ?? null
  const missingPriceStocks = data?.data.missingPriceStocks ?? []
  const latest = points[points.length - 1]

  // 起点日が表示範囲に入っているときだけ基準線を出す。
  // 範囲外だと Recharts が描画しないうえ、凡例だけ残って紛らわしいため。
  const showsBaseline = baselineDate !== null && points.some((p) => p.date === baselineDate)

  // 起点日より後の期間（例：先月）を選ぶと、その範囲に描けるデータが無いことがある。
  // 「取引履歴がない」のとは原因が違うので、メッセージを分ける。
  const isOutOfRange = points.length === 0 && baselineDate !== null

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            日次終値で評価した資産推移
            {baselineDate && `（起点日 ${baselineDate} 以降）`}
          </p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as TimelineRange)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMELINE_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">評価額</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latest ? formatCurrency(latest.marketValue) : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">投資元本</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latest ? formatCurrency(latest.investedPrincipal) : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">評価損益</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                latest && latest.unrealizedPL < 0 ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {latest ? formatCurrency(latest.unrealizedPL) : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">累計配当受取</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {latest ? formatCurrency(latest.cumulativeDividends) : '-'}
            </div>
          </CardContent>
        </Card>
      </div>

      {missingPriceStocks.length > 0 && (
        <p className="text-sm text-amber-600">
          日次終値が未取得のため評価額に含まれていない銘柄が {missingPriceStocks.length} 件あります
          （{missingPriceStocks.map((s) => s.code).join(', ')}）。
          日次終値の取り込みバッチを実行してください。
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>資産推移</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">読み込み中...</p>
          ) : isOutOfRange ? (
            <p className="text-muted-foreground">
              この期間のデータがありません（起点日 {baselineDate} 以降が対象です）。
            </p>
          ) : points.length === 0 ? (
            <p className="text-muted-foreground">
              取引履歴がまだないため推移を表示できません。
            </p>
          ) : (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" minTickGap={40} />
                  <YAxis
                    tickFormatter={(value) => `${Math.round((value as number) / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Legend />
                  {/* 起点日より前は保有が不明で描いていない（ADR 0009）。
                      そのため起点日でグラフが 0 から立ち上がるが、これは
                      その日に資産が急増したという意味ではない。境界を明示する。 */}
                  {showsBaseline && (
                    <ReferenceLine
                      x={baselineDate ?? undefined}
                      stroke="#94a3b8"
                      strokeDasharray="3 3"
                      label={{ value: '起点日', position: 'insideTopLeft', fontSize: 11, fill: '#64748b' }}
                    />
                  )}
                  {/* 評価額と投資元本の差＝評価損益。塗りで損益の厚みを見せる */}
                  <Area
                    type="monotone"
                    dataKey="unrealizedPL"
                    name="評価損益"
                    stroke="none"
                    fill="#00C49F"
                    fillOpacity={0.15}
                  />
                  <Line
                    type="monotone"
                    dataKey="marketValue"
                    name="評価額"
                    stroke="#0088FE"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="investedPrincipal"
                    name="投資元本"
                    stroke="#8884d8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeDividends"
                    name="累計配当受取"
                    stroke="#FFBB28"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
