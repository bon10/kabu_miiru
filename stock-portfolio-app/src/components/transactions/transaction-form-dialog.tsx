'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { todayInput } from '@/lib/date-key'
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

// 編集対象の取引。指定されるとダイアログは編集モードになり、
// 既存値を初期表示して PUT で更新する（銘柄の付け替えは非対応）。
export interface EditableTransaction {
  id: number
  stockId: number
  transactionType: TransactionType
  shares: number
  pricePerShare: number
  fee: number
  transactionDate: string
  memo?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  stocks: StockOption[]
  defaultStockId?: number
  defaultType?: TransactionType
  transaction?: EditableTransaction | null
  onSubmitted?: () => void
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  stocks,
  defaultStockId,
  defaultType = 'BUY',
  transaction,
  onSubmitted,
}: Props) {
  const isEdit = !!transaction
  const [transactionType, setTransactionType] =
    useState<TransactionType>(defaultType)
  const [stockId, setStockId] = useState<string>(
    defaultStockId ? String(defaultStockId) : ''
  )
  const [shares, setShares] = useState('')
  const [pricePerShare, setPricePerShare] = useState('')
  const [fee, setFee] = useState('0')
  const [transactionDate, setTransactionDate] = useState(() =>
    todayInput()
  )
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (transaction) {
      // 編集モード: 既存の取引値を初期表示する
      setTransactionType(transaction.transactionType)
      setStockId(String(transaction.stockId))
      setShares(String(transaction.shares))
      setPricePerShare(String(transaction.pricePerShare))
      setFee(String(transaction.fee))
      setTransactionDate(transaction.transactionDate.slice(0, 10))
      setMemo(transaction.memo ?? '')
      setError(null)
    } else {
      setTransactionType(defaultType)
      setStockId(defaultStockId ? String(defaultStockId) : '')
      setShares('')
      setPricePerShare('')
      setFee('0')
      setTransactionDate(todayInput())
      setMemo('')
      setError(null)
    }
  }, [open, defaultStockId, defaultType, transaction])

  const selectedStock = stocks.find((s) => s.id === Number(stockId))
  const sharesNum = Number(shares)
  // 新規登録時のみ保有超過チェックを行う。編集時は対象取引自体が現保有株数に
  // 含まれており単純比較できないため、サーバー側の再計算（売却はクランプ）に委ねる。
  const sellExceedsHolding =
    !isEdit &&
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
      const res = await fetch(
        isEdit ? `/api/transactions/${transaction.id}` : '/api/transactions',
        {
          method: isEdit ? 'PUT' : 'POST',
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
        },
      )
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
            <DialogTitle>{isEdit ? '取引を編集' : '新規取引追加'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? '登録済みの取引内容を修正します。銘柄の変更はできません。'
                : '購入または売却を登録します。売却時は保有株数を超えない範囲で指定してください。'}
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
              <Select
                value={stockId}
                onValueChange={setStockId}
                disabled={isEdit}
              >
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
              {submitting ? '保存中...' : isEdit ? '更新' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
