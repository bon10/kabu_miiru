'use client'

import { useEffect, useState } from 'react'
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

export interface DividendStockOption {
  id: number
  stockName: string
  code: string
  market: string
}

type DividendType = '期末' | '中間' | '特別' | '分配金'
type Currency = 'JPY' | 'USD'

// 銘柄の市場から受取通貨の初期値を決める（米国株はドル受取が既定）。
// ただし証券会社の円受取もあるため、フォーム上でユーザーが変更できる。
function defaultCurrencyForMarket(market: string | undefined): Currency {
  return market === '米国' ? 'USD' : 'JPY'
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  stocks: DividendStockOption[]
  defaultStockId?: number
  onSubmitted?: () => void
}

export function DividendFormDialog({
  open,
  onOpenChange,
  stocks,
  defaultStockId,
  onSubmitted,
}: Props) {
  const [stockId, setStockId] = useState<string>(
    defaultStockId ? String(defaultStockId) : ''
  )
  const [dividendAmount, setDividendAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('JPY')
  // 通貨をユーザーが手動で選び直したか。選び直した後に銘柄を変えても勝手に上書きしない。
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [dividendType, setDividendType] = useState<DividendType>('期末')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setStockId(defaultStockId ? String(defaultStockId) : '')
      setDividendAmount('')
      const initialMarket = stocks.find((s) => s.id === defaultStockId)?.market
      setCurrency(defaultCurrencyForMarket(initialMarket))
      setCurrencyTouched(false)
      setPaymentDate(new Date().toISOString().slice(0, 10))
      setDividendType('期末')
      setError(null)
    }
  }, [open, defaultStockId, stocks])

  // 銘柄を選ぶと受取通貨の初期値をその市場に合わせる。
  // ただしユーザーが通貨を明示的に変更済みなら尊重して上書きしない。
  function handleStockChange(nextStockId: string) {
    setStockId(nextStockId)
    if (!currencyTouched) {
      const market = stocks.find((s) => String(s.id) === nextStockId)?.market
      setCurrency(defaultCurrencyForMarket(market))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!stockId) {
      setError('銘柄を選択してください')
      return
    }
    const amount = Number(dividendAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('配当金額は 0 より大きい値を指定してください')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/dividends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId: Number(stockId),
          dividendAmount: amount,
          currency,
          paymentDate,
          dividendType,
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
            <DialogTitle>受取配当を追加</DialogTitle>
            <DialogDescription>
              実際に受け取った配当金を記録します（銘柄マスタの予想配当とは別物）。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">銘柄</label>
              <Select value={stockId} onValueChange={handleStockChange}>
                <SelectTrigger>
                  <SelectValue placeholder="銘柄を選択" />
                </SelectTrigger>
                <SelectContent>
                  {stocks.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.stockName}（{s.code}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">通貨</label>
                <Select
                  value={currency}
                  onValueChange={(v) => {
                    setCurrency(v as Currency)
                    setCurrencyTouched(true)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JPY">円 (JPY)</SelectItem>
                    <SelectItem value="USD">ドル (USD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">配当金額</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step={currency === 'USD' ? '0.01' : '1'}
                  min="0"
                  value={dividendAmount}
                  onChange={(e) => setDividendAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">支払日</label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">配当種別</label>
              <Select
                value={dividendType}
                onValueChange={(v) => setDividendType(v as DividendType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="期末">期末</SelectItem>
                  <SelectItem value="中間">中間</SelectItem>
                  <SelectItem value="特別">特別</SelectItem>
                  <SelectItem value="分配金">分配金（ETF・投信）</SelectItem>
                </SelectContent>
              </Select>
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
              {submitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
