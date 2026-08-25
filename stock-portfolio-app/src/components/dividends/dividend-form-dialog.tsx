'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { SearchableSelect } from '@/components/ui/searchable-select'
import { formatMoney } from '@/lib/utils'
import { calcDividendReceipt, DIVIDEND_CALC_MESSAGES } from '@/lib/dividend'

export interface DividendStockOption {
  id: number
  stockName: string
  code: string
  market: string
  // 現在の保有株数（Transaction 由来の派生キャッシュ：ADR 0003）。
  // 入力された 1 株あたり配当金にこの株数を掛けて受取総額を求める。
  sharesHeld: number
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
  // 証券会社から通知される「1 株あたり配当金」をそのまま入力する。
  // 受取総額は保存時に保有株数を掛けて算出するため、ここでは総額を入力しない。
  const [dividendPerShare, setDividendPerShare] = useState('')
  const [currency, setCurrency] = useState<Currency>('JPY')
  // 通貨をユーザーが手動で選び直したか。選び直した後に銘柄を変えても勝手に上書きしない。
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const [paymentDate, setPaymentDate] = useState(() =>
    todayInput()
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
      setDividendPerShare('')
      const initialMarket = stocksRef.current.find(
        (s) => s.id === initialStockId
      )?.market
      setCurrency(defaultCurrencyForMarket(initialMarket))
      setCurrencyTouched(false)
      setPaymentDate(todayInput())
      setDividendType(DIVIDEND_TYPE_UNSPECIFIED)
      setError(null)
    }
  }, [open])

  // 選択中の銘柄と、その現在保有株数・想定受取総額（1 株配当 × 保有株数）を導出する。
  const selectedStock = useMemo(
    () => stocks.find((s) => String(s.id) === stockId),
    [stocks, stockId]
  )
  const sharesHeld = selectedStock?.sharesHeld ?? 0
  const perShareValue = Number(dividendPerShare)
  // 想定受取額の計算・検証はサーバーと同じ calcDividendReceipt に委ねる（計算の二重化を避ける）。
  // 実際の保存額はサーバー側の最新保有株数で確定するため、ここでの値は「想定」。
  const calc = calcDividendReceipt(perShareValue, sharesHeld)

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
    if (!calc.ok) {
      setError(DIVIDEND_CALC_MESSAGES[calc.error])
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/dividends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId: Number(stockId),
          // 1 株あたり配当金のみ送り、受取総額はサーバー側で保有株数を掛けて確定する。
          dividendPerShare: perShareValue,
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
              1株あたりの配当金を入力すると、保有株数を掛けた受取総額を記録します（銘柄マスタの予想配当とは別物）。
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
                <label className="text-sm font-medium">1株あたり配当金</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={dividendPerShare}
                  onChange={(e) => setDividendPerShare(e.target.value)}
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

            {stockId && (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  保有株数:{' '}
                  <span className="font-medium text-foreground">
                    {sharesHeld.toLocaleString()} 株
                  </span>
                </span>
                <span className="text-muted-foreground">
                  想定受取額:{' '}
                  <span className="font-semibold text-blue-600">
                    {calc.ok ? formatMoney(calc.total, currency) : '—'}
                  </span>
                </span>
              </div>
            )}

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
