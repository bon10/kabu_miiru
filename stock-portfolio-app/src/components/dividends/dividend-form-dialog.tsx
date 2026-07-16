'use client'

import { useEffect, useRef, useState } from 'react'
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
import { SearchableSelect } from '@/components/ui/searchable-select'

export interface DividendStockOption {
  id: number
  stockName: string
  code: string
  market: string
}

// 配当種別は表示専用ラベルで集計には使わない。証券会社が期を示さず判別できないこともあるため未指定を許す。
const DIVIDEND_TYPE_UNSPECIFIED = '__none__'
type DividendType = '期末' | '中間' | '四半期' | '特別' | '分配金'
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
  // 未指定は DIVIDEND_TYPE_UNSPECIFIED。Radix Select は空文字の値を持てないためセンチネルで表す。
  const [dividendType, setDividendType] = useState<
    DividendType | typeof DIVIDEND_TYPE_UNSPECIFIED
  >(DIVIDEND_TYPE_UNSPECIFIED)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 初期化に使うだけの props は ref に退避する。これらを effect の依存に入れると、
  // タブ復帰時の SWR 再取得で stocks の参照が変わるたびにフォームがリセットされてしまうため。
  const defaultStockIdRef = useRef(defaultStockId)
  defaultStockIdRef.current = defaultStockId
  const stocksRef = useRef(stocks)
  stocksRef.current = stocks

  // フォームの初期化はダイアログが開いた瞬間だけ行う（open が false→true に変わったとき）。
  useEffect(() => {
    if (open) {
      const initialStockId = defaultStockIdRef.current
      setStockId(initialStockId ? String(initialStockId) : '')
      setDividendAmount('')
      const initialMarket = stocksRef.current.find(
        (s) => s.id === initialStockId
      )?.market
      setCurrency(defaultCurrencyForMarket(initialMarket))
      setCurrencyTouched(false)
      setPaymentDate(new Date().toISOString().slice(0, 10))
      setDividendType(DIVIDEND_TYPE_UNSPECIFIED)
      setError(null)
    }
  }, [open])

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
          // 未指定センチネルは送らず null にして、サーバー側で種別なし（NULL）として保存させる。
          dividendType:
            dividendType === DIVIDEND_TYPE_UNSPECIFIED ? null : dividendType,
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
              <SearchableSelect
                value={stockId}
                onValueChange={handleStockChange}
                placeholder="銘柄を選択"
                searchPlaceholder="銘柄名・コードで検索..."
                options={stocks.map((s) => ({
                  value: String(s.id),
                  label: `${s.stockName}（${s.code}）`,
                  keywords: s.code,
                }))}
              />
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
              <label className="text-sm font-medium">配当種別（任意）</label>
              <Select
                value={dividendType}
                onValueChange={(v) =>
                  setDividendType(
                    v as DividendType | typeof DIVIDEND_TYPE_UNSPECIFIED
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DIVIDEND_TYPE_UNSPECIFIED}>
                    未指定
                  </SelectItem>
                  <SelectItem value="期末">期末</SelectItem>
                  <SelectItem value="中間">中間</SelectItem>
                  <SelectItem value="四半期">
                    四半期（米国株など年4回）
                  </SelectItem>
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
