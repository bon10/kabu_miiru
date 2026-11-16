'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDateKey, todayInput } from '@/lib/date-key'
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
import {
  StockSelect,
  type StockSelectOption,
} from '@/components/stocks/stock-select'
import { formatMoney } from '@/lib/utils'
import {
  calcDividendReceipt,
  perShareFromTotal,
  resolveDividendTax,
  DIVIDEND_CALC_MESSAGES,
  DIVIDEND_TAX_MESSAGES,
  DIVIDEND_TYPES,
  type DividendType,
} from '@/lib/dividend'
import { DividendTypeSelect } from '@/components/dividends/dividend-type-select'

export interface DividendStockOption extends StockSelectOption {
  // 受取通貨の初期値を決めるためだけに持つ（米国株はドル受取が既定）。
  // 保有株数は持たない：配当合計に掛けるのは明細の数量で、現在の保有株数は使わない（ADR 0015）。
  market: string
}

// 数値入力欄の値を API に渡す形へ直す。空欄は「未入力」として null にし、0 と区別する。
function toOptionalNumber(input: string): number | null {
  return input.trim() === '' ? null : Number(input)
}

type Currency = 'JPY' | 'USD'

// 銘柄の市場から受取通貨の初期値を決める（米国株はドル受取が既定）。
// ただし証券会社の円受取もあるため、フォーム上でユーザーが変更できる。
function defaultCurrencyForMarket(market: string | undefined): Currency {
  return market === '米国' ? 'USD' : 'JPY'
}

// 編集対象の受取配当。API が返す保存済みの値そのまま（金額は受取通貨建て）。
export interface EditableDividend {
  id: number
  stockId: number
  dividendAmount: number
  // ADR 0015 より前に登録した記録は shares / taxAmount / netAmount を持たず null
  shares: number | null
  taxAmount: number | null
  netAmount: number | null
  currency: string
  paymentDate: string
  dividendType: string | null
}

// 数値を入力欄の文字列に直す。null（値なし）は空欄にする。
function toInputValue(value: number | null): string {
  return value === null ? '' : String(value)
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  stocks: DividendStockOption[]
  defaultStockId?: number
  // 渡すと、その記録を直す編集フォームになる（保存先が更新 API に変わる）。
  // 渡さない・null のときは新規追加フォーム。
  editing?: EditableDividend | null
  onSubmitted?: () => void
}

// 受取配当の追加と編集で共用するフォーム。入力項目と検証は同じで、
// 違いは「開いたときの初期値」と「保存先の API」だけ。
export function DividendFormDialog({
  open,
  onOpenChange,
  stocks,
  defaultStockId,
  editing = null,
  onSubmitted,
}: Props) {
  const [stockId, setStockId] = useState<string>(
    defaultStockId ? String(defaultStockId) : ''
  )
  // 入力は証券会社の配当明細の写し（ADR 0015）。明細の「単価」が 1 株あたり配当金、
  // 「数量」が shares で、掛け合わせた配当・分配金合計はフォームが自動表示する。
  const [dividendPerShare, setDividendPerShare] = useState('')
  const [shares, setShares] = useState('')
  // 税額合計と受取金額は片方だけの入力でよい。もう片方は配当合計から引いて自動で埋まる
  // （米国株は明細の税額合計が空欄なので、受取金額だけ写す運用になる）。
  const [taxAmount, setTaxAmount] = useState('')
  const [netAmount, setNetAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('JPY')
  // 通貨をユーザーが手動で選び直したか。選び直した後に銘柄を変えても勝手に上書きしない。
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const [paymentDate, setPaymentDate] = useState(() =>
    todayInput()
  )
  // null は未指定。サーバー側で種別なし（NULL）として保存される。
  const [dividendType, setDividendType] = useState<DividendType | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 初期化に使うだけの props は ref に退避する。これらを effect の依存に入れると、
  // タブ復帰時の SWR 再取得で stocks の参照が変わるたびにフォームがリセットされてしまうため。
  const defaultStockIdRef = useRef(defaultStockId)
  defaultStockIdRef.current = defaultStockId
  const stocksRef = useRef(stocks)
  stocksRef.current = stocks
  const editingRef = useRef(editing)
  editingRef.current = editing

  // フォームの初期化はダイアログが開いた瞬間だけ行う（open が false→true に変わったとき）。
  useEffect(() => {
    if (!open) return
    const target = editingRef.current
    if (target) {
      // 編集：保存済みの値で埋める。単価は保存していない（ADR 0015）ため配当合計と数量から
      // 逆算する。数量を持たない旧レコードは逆算できないので、単価・数量とも空欄から入れ直す。
      setStockId(String(target.stockId))
      setDividendPerShare(
        toInputValue(perShareFromTotal(target.dividendAmount, target.shares))
      )
      setShares(toInputValue(target.shares))
      setTaxAmount(toInputValue(target.taxAmount))
      setNetAmount(toInputValue(target.netAmount))
      setCurrency(target.currency === 'USD' ? 'USD' : 'JPY')
      // 保存済みの通貨を、銘柄の選び直しで市場の既定値に上書きさせない
      setCurrencyTouched(true)
      setPaymentDate(formatDateKey(new Date(target.paymentDate)))
      setDividendType(
        DIVIDEND_TYPES.find((t) => t === target.dividendType) ?? null
      )
      setError(null)
    } else {
      const initialStockId = defaultStockIdRef.current
      setStockId(initialStockId ? String(initialStockId) : '')
      setDividendPerShare('')
      setTaxAmount('')
      setNetAmount('')
      // 数量は空欄から始める。現在の保有株数を初期値に入れると、権利確定後に売買していても
      // 数字が埋まっていて正しそうに見え、明細を確認せず保存してしまうため（ADR 0015）
      setShares('')
      const initialMarket = stocksRef.current.find(
        (s) => s.id === initialStockId
      )?.market
      setCurrency(defaultCurrencyForMarket(initialMarket))
      setCurrencyTouched(false)
      setPaymentDate(todayInput())
      setDividendType(null)
      setError(null)
    }
  }, [open])

  // 明細の入力値から配当合計・税額合計・受取金額を組み立てる。
  const perShareValue = Number(dividendPerShare)
  const sharesValue = Number(shares)
  // 計算・検証はサーバーと同じ純粋関数に委ねる（計算の二重化を避ける）。
  const calc = calcDividendReceipt(perShareValue, sharesValue)
  const tax = calc.ok
    ? resolveDividendTax(
        calc.total,
        toOptionalNumber(taxAmount),
        toOptionalNumber(netAmount)
      )
    : null

  // 銘柄を選ぶと受取通貨の初期値をその市場に合わせる。
  // ただしユーザーが通貨を明示的に変更済みなら尊重して上書きしない。
  function handleStockChange(nextStockId: string) {
    setStockId(nextStockId)
    // 銘柄を選び直したら数量は空欄に戻す（前の銘柄の数量を持ち越さない）
    setShares('')
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
    if (tax && !tax.ok) {
      setError(DIVIDEND_TAX_MESSAGES[tax.error])
      return
    }

    setSubmitting(true)
    try {
      // 追加と編集で送る項目は同じ。編集は更新 API に送る
      const res = await fetch(
        editing ? `/api/dividends/${editing.id}` : '/api/dividends',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stockId: Number(stockId),
            // 明細の写しをそのまま送る。配当合計・税額・受取金額の確定はサーバー側でも
            // 同じ純粋関数を通すため、ここでは入力値だけを渡す。
            dividendPerShare: perShareValue,
            shares: sharesValue,
            taxAmount: toOptionalNumber(taxAmount),
            netAmount: toOptionalNumber(netAmount),
            currency,
            paymentDate,
            dividendType,
          }),
        }
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
            <DialogTitle>
              {editing ? '受取配当を編集' : '受取配当を追加'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? editing.shares === null
                  ? 'この記録には数量が保存されていないため、単価と数量を証券会社の配当明細から入れ直してください。'
                  : '間違えた項目を直して保存します。単価は保存していないため、配当・分配金合計 ÷ 数量で逆算した値が入っています。'
                : '証券会社の配当明細をそのまま写します。数量は現在の保有株数ではなく明細の数量を入力してください（配当は権利確定日の株数で決まるため）。税額合計か受取金額のどちらかを入れると残りが埋まります。'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">銘柄</label>
              <StockSelect
                stocks={stocks}
                value={stockId}
                onValueChange={handleStockChange}
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
                <label className="text-sm font-medium">単価（1株あたり）</label>
                {/* 明細の単価は小数第5位まで出ることがある（例: JEPQ 0.70497）ため
                    刻みを設けず any にする。step を固定すると端数のある単価を弾いてしまう */}
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={dividendPerShare}
                  onChange={(e) => setDividendPerShare(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">数量</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  placeholder="明細の数量"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">税額合計（任意）</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  placeholder="明細が「-」なら空欄"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">受取金額（任意）</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={netAmount}
                  onChange={(e) => setNetAmount(e.target.value)}
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
              <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  配当・分配金合計:{' '}
                  <span className="font-medium text-foreground">
                    {calc.ok ? formatMoney(calc.total, currency) : '—'}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  税額合計:{' '}
                  <span className="font-medium text-foreground">
                    {tax?.ok && tax.tax !== null
                      ? formatMoney(tax.tax, currency)
                      : '—'}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  受取金額:{' '}
                  <span className="font-semibold text-blue-600">
                    {tax?.ok && tax.net !== null
                      ? formatMoney(tax.net, currency)
                      : '—'}
                  </span>
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">配当種別（任意）</label>
              <DividendTypeSelect
                value={dividendType}
                onValueChange={setDividendType}
              />
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
