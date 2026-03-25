'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getMarketFromCode } from '@/lib/utils'

interface StockFormData {
  stockName: string
  code: string
  holdingCompany: string
  market: string
  sharesHeld: number
  avgAcquisitionPrice: number
  investmentAmount: number
  dividendPerShare: number
  dividendYield: number
  purchaseDate: string
  targetPrice: string
  marketSector: string
  purpose: string
}

interface Broker {
  id: number
  name: string
}

interface StockFormProps {
  mode: 'create' | 'edit'
  stockId?: number
  initialData?: Partial<StockFormData>
  brokers: Broker[]
}

const defaultFormData: StockFormData = {
  stockName: '',
  code: '',
  holdingCompany: '',
  market: '',
  sharesHeld: 0,
  avgAcquisitionPrice: 0,
  investmentAmount: 0,
  dividendPerShare: 0,
  dividendYield: 0,
  purchaseDate: '',
  targetPrice: '',
  marketSector: '',
  purpose: '',
}

export default function StockForm({
  mode,
  stockId,
  initialData,
  brokers,
}: StockFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState<StockFormData>({
    ...defaultFormData,
    ...initialData,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (field: keyof StockFormData, value: string | number) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value }
      // コード変更時に市場を自動判定
      if (field === 'code' && typeof value === 'string' && value) {
        updated.market = getMarketFromCode(value)
      }
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.stockName || !formData.code || !formData.holdingCompany) {
      setError('銘柄名、コード、証券会社は必須です。')
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...formData,
        sharesHeld: Number(formData.sharesHeld),
        avgAcquisitionPrice: Number(formData.avgAcquisitionPrice),
        investmentAmount: Number(formData.investmentAmount),
        dividendPerShare: Number(formData.dividendPerShare),
        dividendYield: Number(formData.dividendYield),
        targetPrice: formData.targetPrice ? Number(formData.targetPrice) : null,
        purchaseDate: formData.purchaseDate || null,
        marketSector: formData.marketSector || null,
        purpose: formData.purpose || null,
      }

      const url = mode === 'create' ? '/api/stocks' : `/api/stocks/${stockId}`
      const method = mode === 'create' ? 'POST' : 'PUT'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error?.message || '保存に失敗しました')
      }

      const result = await response.json()
      router.push(`/stocks/${result.data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (
      !confirm('この銘柄を削除しますか？関連する取引履歴も全て削除されます。')
    ) {
      return
    }

    setDeleting(true)
    try {
      const response = await fetch(`/api/stocks/${stockId}`, {
        method: 'DELETE',
      })
      if (!response.ok && response.status !== 204) {
        throw new Error('削除に失敗しました')
      }
      router.push('/stocks')
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button asChild variant="outline">
            <Link
              href={
                mode === 'edit' && stockId ? `/stocks/${stockId}` : '/stocks'
              }
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">
            {mode === 'create' ? '新規銘柄登録' : '銘柄編集'}
          </h1>
        </div>
        {mode === 'edit' && (
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            削除
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  銘柄名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.stockName}
                  onChange={(e) => handleChange('stockName', e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="例: トヨタ自動車"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  コード <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => handleChange('code', e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="例: 7203 / AAPL"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  証券会社 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.holdingCompany}
                  onChange={(e) =>
                    handleChange('holdingCompany', e.target.value)
                  }
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">選択してください</option>
                  {brokers.map((broker) => (
                    <option key={broker.id} value={broker.name}>
                      {broker.name}
                    </option>
                  ))}
                </select>
                {brokers.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <a
                      href="/settings"
                      className="text-primary hover:underline"
                    >
                      設定
                    </a>
                    から証券会社を登録してください
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">市場</label>
                <input
                  type="text"
                  value={formData.market}
                  onChange={(e) => handleChange('market', e.target.value)}
                  className="w-full p-2 border rounded-md bg-gray-50"
                  placeholder="コードから自動判定"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  セクター
                </label>
                <input
                  type="text"
                  value={formData.marketSector}
                  onChange={(e) => handleChange('marketSector', e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="例: 自動車"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  投資目的
                </label>
                <input
                  type="text"
                  value={formData.purpose}
                  onChange={(e) => handleChange('purpose', e.target.value)}
                  className="w-full p-2 border rounded-md"
                  placeholder="例: 長期保有"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 保有・投資情報 */}
        <Card>
          <CardHeader>
            <CardTitle>保有・投資情報</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  保有株数
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.sharesHeld}
                  onChange={(e) => handleChange('sharesHeld', e.target.value)}
                  className="w-full p-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  平均取得単価
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.avgAcquisitionPrice}
                  onChange={(e) =>
                    handleChange('avgAcquisitionPrice', e.target.value)
                  }
                  className="w-full p-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">投資額</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.investmentAmount}
                  onChange={(e) =>
                    handleChange('investmentAmount', e.target.value)
                  }
                  className="w-full p-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">購入日</label>
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => handleChange('purchaseDate', e.target.value)}
                  className="w-full p-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  目標価格
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.targetPrice}
                  onChange={(e) => handleChange('targetPrice', e.target.value)}
                  className="w-full p-2 border rounded-md"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 配当情報 */}
        <Card>
          <CardHeader>
            <CardTitle>配当情報</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  1株配当金
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.dividendPerShare}
                  onChange={(e) =>
                    handleChange('dividendPerShare', e.target.value)
                  }
                  className="w-full p-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  配当利回り
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.dividendYield}
                  onChange={(e) =>
                    handleChange('dividendYield', e.target.value)
                  }
                  className="w-full p-2 border rounded-md"
                  placeholder="例: 0.03 (3%)"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 送信ボタン */}
        <div className="flex justify-end space-x-4">
          <Button asChild variant="outline">
            <Link
              href={
                mode === 'edit' && stockId ? `/stocks/${stockId}` : '/stocks'
              }
            >
              キャンセル
            </Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {mode === 'create' ? '登録' : '保存'}
          </Button>
        </div>
      </form>
    </div>
  )
}
