'use client'

import { useEffect, useState } from 'react'
import StockForm from '@/components/stocks/stock-form'

interface Broker {
  id: number
  name: string
}

export default function NewStockPage() {
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/brokers')
      .then((res) => res.json())
      .then((result) => {
        setBrokers(result.data || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">新規銘柄登録</h1>
        <p>読み込み中...</p>
      </div>
    )
  }

  return <StockForm mode="create" brokers={brokers} />
}
