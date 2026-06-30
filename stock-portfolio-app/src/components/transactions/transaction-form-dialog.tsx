'use client'

import { useState, useEffect } from 'react'
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

export interface StockOption {
  id: number
  stockName: string
  code: string
  sharesHeld: number
}

type TransactionType = 'BUY' | 'SELL'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  stocks: StockOption[]
  defaultStockId?: number
  defaultType?: TransactionType
  onSubmitted?: () => void
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  stocks,
  defaultStockId,
  defaultType = 'BUY',
  onSubmitted,
}: Props) {
  const [transactionType, setTransactionType] =
    useState<TransactionType>(defaultType)
  const [stockId, setStockId] = useState<string>(
    defaultStockId ? String(defaultStockId) : ''
  )
  const [shares, setShares] = useState('')
  const [pricePerShare, setPricePerShare] = useState('')
  const [fee, setFee] = useState('0')
  const [transactionDate, setTransactionDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTransactionType(defaultType)
      setStockId(defaultStockId ? String(defaultStockId) : '')
      setShares('')
      setPricePerShare('')
      setFee('0')
      setTransactionDate(new Date().toISOString().slice(0, 10))
      setMemo('')
      setError(null)
    }
  }, [open, defaultStockId, defaultType])

  const selectedStock = stocks.find((s) => s.id === Number(stockId))
  const sharesNum = Number(shares)
  const sellExceedsHolding =
    transactionType === 'SELL' &&
    selectedStock &&
    sharesNum > selectedStock.sharesHeld

  const totalAmount = (() => {
    const s = Number(shares)
    const p = Number(pricePerShare)
    if (!Number.isFinite(s) || !Number.isFinite(p)) return 0
    return s * p
  })()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!stockId) {
      setError('銘柄を選択してください')
      return
    }
    if (sharesNum <= 0) {
      setError('株数は 0 より大きい値を指定してください')
      return
    }
    if (Number(pricePerShare) < 0) {
      setError('単価は 0 以上を指定してください')
      return
    }
    if (sellExceedsHolding) {
      setError('売却株数が保有株数を超えています')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId: Number(stockId),
          transactionType,
          shares: sharesNum,
          pricePerShare: Number(pricePerShare),
          fee: Number(fee) || 0,
          transactionDate,
          memo: memo || undefined,
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
            <DialogTitle>新規取引追加</DialogTitle>
            <DialogDescription>
              購入または売却を登録します。売却時は保有株数を超えない範囲で指定してください。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">取引種別</label>
              <Select
                value={transactionType}
                onValueChange={(v) => setTransactionType(v as TransactionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">購入</SelectItem>
                  <SelectItem value="SELL">売却</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">銘柄</label>
              <Select value={stockId} onValueChange={setStockId}>
                <SelectTrigger>
                  <SelectValue placeholder="銘柄を選択" />
                </SelectTrigger>
                <SelectContent>
                  {stocks.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.stockName}（{s.code}） / 保有 {s.sharesHeld}株
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">株数</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min="0"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">単価</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min="0"
                  value={pricePerShare}
                  onChange={(e) => setPricePerShare(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">手数料</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">取引日</label>
                <Input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">メモ（任意）</label>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>

            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm flex justify-between">
              <span>取引金額</span>
              <span className="font-medium">
                {totalAmount.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            {sellExceedsHolding && (
              <p className="text-sm text-destructive">
                保有株数（{selectedStock?.sharesHeld}）を超える売却はできません
              </p>
            )}

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
              {submitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
