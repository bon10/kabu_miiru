'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StockForm from '@/components/stocks/stock-form'

interface Broker {
  id: number
  name: string
}

export default function EditStockPage() {
  const params = useParams()
  const [initialData, setInitialData] = useState<Record<
    string,
    string | number | null
  > | null>(null)
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/stocks/${params.id}`)
        if (!response.ok) throw new Error('Failed to fetch')
        const result = await response.json()
        const stock = result.data

        setInitialData({
          stockName: stock.stockName,
          code: stock.code,
          holdingCompany: stock.holdingCompany,
          market: stock.market,
          dividendPerShare: stock.dividendPerShare,
          dividendYield: stock.dividendYield,
          targetPrice: stock.targetPrice ?? '',
          marketSector: stock.marketSector ?? '',
          purpose: stock.purpose ?? '',
        })
        setBrokers(stock.brokers || [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    if (params.id) fetchData()
  }, [params.id])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button asChild variant="outline">
            <Link href="/stocks">
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Link>
          </Button>
        </div>
        <p>読み込み中...</p>
      </div>
    )
  }

  if (error || !initialData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button asChild variant="outline">
            <Link href="/stocks">
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Link>
          </Button>
        </div>
        <p>銘柄が見つかりません。</p>
      </div>
    )
  }

  return (
    <StockForm
      mode="edit"
      stockId={Number(params.id)}
      initialData={initialData}
      brokers={brokers}
    />
  )
}
