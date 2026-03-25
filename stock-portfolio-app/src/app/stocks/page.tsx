'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Filter } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatPercentage } from '@/lib/utils'

interface Stock {
  id: number
  stockName: string
  holdingCompany: string
  market: string
  code: string
  sharesHeld: number
  avgAcquisitionPrice: number
  investmentAmount: number
  currentPrice: number
  profitLoss: number
  profitLossRate: number
  dividendPerShare: number
  dividendYield: number
  dividendAmount: number
  purchaseDate?: string
  lastPriceUpdate?: string
}

interface StocksResponse {
  stocks: Stock[]
  totalCount: number
  filters: {
    market: string[]
    holdingCompany: string[]
  }
}

export default function StocksPage() {
  const [data, setData] = useState<StocksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    includeZero: false,
    market: '',
    holdingCompany: '',
    sortBy: 'stockName',
    sortOrder: 'asc'
  })

  const fetchStocks = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (filters.includeZero) params.append('includeZero', 'true')
      if (filters.market) params.append('market', filters.market)
      if (filters.holdingCompany) params.append('holdingCompany', filters.holdingCompany)
      params.append('sortBy', filters.sortBy)
      params.append('sortOrder', filters.sortOrder)

      const response = await fetch(`/api/stocks?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch stocks')
      }
      
      const result = await response.json()
      setData(result.data)
    } catch (error) {
      console.error('Error fetching stocks:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStocks()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  const handleFilterChange = (key: string, value: string | boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">銘柄一覧</h1>
        <p>読み込み中...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">銘柄一覧</h1>
        <p>データの読み込みに失敗しました。</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">銘柄一覧</h1>
          <p className="text-muted-foreground">
            {data.totalCount}銘柄を管理中
          </p>
        </div>
        <Button asChild>
          <Link href="/stocks/new">
            <Plus className="h-4 w-4 mr-2" />
            銘柄追加
          </Link>
        </Button>
      </div>

      {/* フィルター */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-4 w-4 mr-2" />
            フィルター
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                保有株数0を含む
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.includeZero}
                  onChange={(e) => handleFilterChange('includeZero', e.target.checked)}
                  className="mr-2"
                />
                売却済み銘柄も表示
              </label>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                市場
              </label>
              <select
                value={filters.market}
                onChange={(e) => handleFilterChange('market', e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">すべて</option>
                {data.filters.market.map(market => (
                  <option key={market} value={market}>{market}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                証券会社
              </label>
              <select
                value={filters.holdingCompany}
                onChange={(e) => handleFilterChange('holdingCompany', e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">すべて</option>
                {data.filters.holdingCompany.map(company => (
                  <option key={company} value={company}>{company}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                ソート
              </label>
              <select
                value={`${filters.sortBy}-${filters.sortOrder}`}
                onChange={(e) => {
                  const [sortBy, sortOrder] = e.target.value.split('-')
                  handleFilterChange('sortBy', sortBy)
                  handleFilterChange('sortOrder', sortOrder)
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="stockName-asc">銘柄名 (昇順)</option>
                <option value="stockName-desc">銘柄名 (降順)</option>
                <option value="profitLoss-desc">損益 (降順)</option>
                <option value="profitLoss-asc">損益 (昇順)</option>
                <option value="profitLossRate-desc">損益率 (降順)</option>
                <option value="profitLossRate-asc">損益率 (昇順)</option>
                <option value="investmentAmount-desc">投資額 (降順)</option>
                <option value="investmentAmount-asc">投資額 (昇順)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 銘柄テーブル */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>銘柄名</TableHead>
                <TableHead>コード</TableHead>
                <TableHead>証券会社</TableHead>
                <TableHead>市場</TableHead>
                <TableHead className="text-right">保有株数</TableHead>
                <TableHead className="text-right">平均取得単価</TableHead>
                <TableHead className="text-right">投資額</TableHead>
                <TableHead className="text-right">現在価格</TableHead>
                <TableHead className="text-right">損益</TableHead>
                <TableHead className="text-right">損益率</TableHead>
                <TableHead className="text-right">配当利回り</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.stocks.map((stock) => (
                <TableRow key={stock.id}>
                  <TableCell className="font-medium">
                    <Link 
                      href={`/stocks/${stock.id}`}
                      className="text-primary hover:underline"
                    >
                      {stock.stockName}
                    </Link>
                  </TableCell>
                  <TableCell>{stock.code}</TableCell>
                  <TableCell>{stock.holdingCompany}</TableCell>
                  <TableCell>{stock.market}</TableCell>
                  <TableCell className="text-right">
                    {stock.sharesHeld.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(stock.avgAcquisitionPrice)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(stock.investmentAmount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(stock.currentPrice)}
                  </TableCell>
                  <TableCell className={`text-right ${
                    stock.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(stock.profitLoss)}
                  </TableCell>
                  <TableCell className={`text-right ${
                    stock.profitLossRate >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatPercentage(stock.profitLossRate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercentage(stock.dividendYield)}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/stocks/${stock.id}/edit`}>
                        編集
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}