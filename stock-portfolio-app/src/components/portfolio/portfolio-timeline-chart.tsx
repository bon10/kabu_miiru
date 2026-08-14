'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

interface TimelineSnapshot {
  date: string
  investedAmount: number
  cumulativeRealizedPL: number
  cumulativeDividends: number
}

interface TimelineResponse {
  data: { snapshots: TimelineSnapshot[] }
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

export default function PortfolioTimelineChart() {
  const [range, setRange] = useState<'12' | '24' | 'all'>('24')

  const { data, isLoading } = useSWR<TimelineResponse>(
    `/api/portfolio/timeline?months=${range}`,
    fetcher,
  )

  const snapshots = data?.data.snapshots ?? []
  const latest = snapshots[snapshots.length - 1]

  const chartData = snapshots.map((s) => ({
    ...s,
    // 月単位表示用のラベル
    label: s.date.slice(0, 7),
  }))

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            月末時点の投資額・累計実現損益・累計配当受取の推移
          </p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as '12' | '24' | 'all')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="12">直近1年</SelectItem>
            <SelectItem value="24">直近2年</SelectItem>
            <SelectItem value="all">全期間</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">現在の投資額</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {latest ? formatCurrency(latest.investedAmount) : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">累計実現損益</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                latest && latest.cumulativeRealizedPL < 0
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}
            >
              {latest ? formatCurrency(latest.cumulativeRealizedPL) : '-'}
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

      <Card>
        <CardHeader>
          <CardTitle>推移</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">読み込み中...</p>
          ) : chartData.length === 0 ? (
            <p className="text-muted-foreground">
              取引履歴がまだないため推移を表示できません。
            </p>
          ) : (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis
                    tickFormatter={(value) =>
                      `${Math.round((value as number) / 1000)}k`
                    }
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="investedAmount"
                    name="投資額"
                    stroke="#0088FE"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeRealizedPL"
                    name="累計実現損益"
                    stroke="#00C49F"
                    strokeWidth={2}
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
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
