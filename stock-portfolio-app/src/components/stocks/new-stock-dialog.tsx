'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getMarketFromCode } from '@/lib/utils'

// 新規銘柄マスタの登録ダイアログ。
// 保有株数・投資額などは Transaction 経由で発生する派生値のため、
// マスタ登録時には扱わない（ADR 0003）。
// ユビキタス言語: docs/2-domain/ubiquitous-language.md
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted?: () => void
}

interface BrokerOption {
  id: number
  name: string
}

interface BrokersResponse {
  data: BrokerOption[]
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

export function NewStockDialog({ open, onOpenChange, onSubmitted }: Props) {
  const { data: brokersData } = useSWR<BrokersResponse>('/api/brokers', fetcher)
  const brokers = brokersData?.data ?? []

  const [stockName, setStockName] = useState('')
  const [code, setCode] = useState('')
  const [holdingCompany, setHoldingCompany] = useState('')
  const [marketSector, setMarketSector] = useState('')
  const [purpose, setPurpose] = useState('')
  const [dividendPerShare, setDividendPerShare] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setStockName('')
      setCode('')
      setHoldingCompany('')
      setMarketSector('')
      setPurpose('')
      setDividendPerShare('')
      setError(null)
    }
  }, [open])

  const market = code ? getMarketFromCode(code) : ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!stockName || !code || !holdingCompany) {
      setError('銘柄名・コード・証券会社は必須です')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockName,
          code,
          holdingCompany,
          market,
          marketSector: marketSector || null,
          purpose: purpose || null,
          dividendPerShare: dividendPerShare ? Number(dividendPerShare) : 0,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? '保存に失敗しました')
        return
      }
      onOpenChange(false)
      onSubmitted?.()
    } catch (err) {
      console.error(err)
      setError('通信エラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>新規銘柄登録</DialogTitle>
            <DialogDescription>
              銘柄マスタを登録します。保有株数・投資額は購入取引を追加すると自動で反映されます。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                銘柄名 <span className="text-red-500">*</span>
              </label>
              <Input
                value={stockName}
                onChange={(e) => setStockName(e.target.value)}
                placeholder="例: トヨタ自動車"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  コード <span className="text-red-500">*</span>
                </label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="例: 7203 / AAPL"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">市場</label>
                <Input
                  value={market}
                  readOnly
                  placeholder="コードから自動判定"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                証券会社 <span className="text-red-500">*</span>
              </label>
              <Select value={holdingCompany} onValueChange={setHoldingCompany}>
                <SelectTrigger>
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {brokers.map((b) => (
                    <SelectItem key={b.id} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {brokers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  <a href="/settings" className="underline">
                    設定
                  </a>
                  から証券会社を登録してください
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">セクター</label>
                <Input
                  value={marketSector}
                  onChange={(e) => setMarketSector(e.target.value)}
                  placeholder="例: 自動車"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">投資目的</label>
                <Input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="例: 長期保有"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">1株配当金（予想）</label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={dividendPerShare}
                onChange={(e) => setDividendPerShare(e.target.value)}
                placeholder="任意"
              />
              <p className="text-xs text-muted-foreground">
                将来の想定配当。実際の受取は配当ページで別途記録します。
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '登録中...' : '登録'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
