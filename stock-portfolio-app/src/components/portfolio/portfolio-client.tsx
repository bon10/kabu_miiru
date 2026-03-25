'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency, formatPercentage } from '@/lib/utils'

interface PortfolioClientProps {
  portfolioData: {
    composition: {
      byStock: Array<{
        stockName: string
        sharesHeld: number
        investmentAmount: number
        percentage: number
        profitLoss: number
        profitLossRate: number
      }>
      byCompany: Array<{
        holdingCompany: string
        sharesHeld: number
        investmentAmount: number
        percentage: number
        stockCount: number
      }>
      byMarket: Array<{
        market: string
        sharesHeld: number
        investmentAmount: number
        percentage: number
        stockCount: number
      }>
    }
    performance: Array<{
      stockName: string
      profitLossRate: number
      profitLoss: number
      investmentAmount: number
    }>
  }
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7C7C']

export default function PortfolioClient({ portfolioData }: PortfolioClientProps) {
  const [activeTab, setActiveTab] = useState('by-stock')

  const renderCustomizedLabel = (entry: Record<string, unknown>) => {
    return `${(entry.percentage as number).toFixed(1)}%`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ポートフォリオ</h1>
        <p className="text-muted-foreground">
          投資状況を視覚的に分析
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="by-stock">銘柄別構成</TabsTrigger>
          <TabsTrigger value="by-company">証券会社別</TabsTrigger>
          <TabsTrigger value="by-market">市場別</TabsTrigger>
          <TabsTrigger value="performance">パフォーマンス</TabsTrigger>
        </TabsList>

        <TabsContent value="by-stock" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>銘柄別構成比率</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={portfolioData.composition.byStock}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={renderCustomizedLabel}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="investmentAmount"
                      >
                        {portfolioData.composition.byStock.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [formatCurrency(value), '投資額']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">詳細</h3>
                  <div className="space-y-2">
                    {portfolioData.composition.byStock.map((stock, index) => (
                      <div key={stock.stockName} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div 
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="font-medium">{stock.stockName}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{stock.sharesHeld}株 ({formatPercentage(stock.percentage / 100)})</div>
                          <div className={`text-sm ${stock.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(stock.profitLoss)} ({formatPercentage(stock.profitLossRate)})
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-company" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>証券会社別構成比率</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={portfolioData.composition.byCompany}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={renderCustomizedLabel}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="investmentAmount"
                      >
                        {portfolioData.composition.byCompany.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [formatCurrency(value), '投資額']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">詳細</h3>
                  <div className="space-y-2">
                    {portfolioData.composition.byCompany.map((company, index) => (
                      <div key={company.holdingCompany} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div 
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="font-medium">{company.holdingCompany}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatCurrency(company.investmentAmount)}</div>
                          <div className="text-sm text-muted-foreground">
                            {company.stockCount}銘柄 ({formatPercentage(company.percentage / 100)})
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-market" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>市場別構成比率</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={portfolioData.composition.byMarket}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={renderCustomizedLabel}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="investmentAmount"
                      >
                        {portfolioData.composition.byMarket.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [formatCurrency(value), '投資額']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">詳細</h3>
                  <div className="space-y-2">
                    {portfolioData.composition.byMarket.map((market, index) => (
                      <div key={market.market} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div 
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="font-medium">{market.market}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatCurrency(market.investmentAmount)}</div>
                          <div className="text-sm text-muted-foreground">
                            {market.stockCount}銘柄 ({formatPercentage(market.percentage / 100)})
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>パフォーマンス比較</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={portfolioData.performance}
                    margin={{
                      top: 5,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="stockName" 
                      angle={-45}
                      textAnchor="end"
                      height={100}
                    />
                    <YAxis 
                      tickFormatter={(value) => formatPercentage(value)}
                    />
                    <Tooltip 
                      formatter={(value: number) => [formatPercentage(value), '損益率']}
                    />
                    <Legend />
                    <Bar 
                      dataKey="profitLossRate" 
                      fill="#8884d8"
                      name="損益率"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
