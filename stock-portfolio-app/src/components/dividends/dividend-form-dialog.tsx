'use client'

import { useEffect, useRef, useState } from 'react'
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
import {
  calcDividendReceipt,
  resolveDividendTax,
  DIVIDEND_CALC_MESSAGES,
  DIVIDEND_TAX_MESSAGES,
} from '@/lib/dividend'

export interface DividendStockOption {
  id: number
  stockName: string
  code: string
  // 受取通貨の初期値を決めるためだけに持つ（米国株はドル受取が既定）。
  // 保有株数は持たない：配当合計に掛けるのは明細の数量で、現在の保有株数は使わない（ADR 0015）。
  market: string
}

// 数値入力欄の値を API に渡す形へ直す。空欄は「未入力」として null にし、0 と区別する。
function toOptionalNumber(input: string): number | null {
  return input.trim() === '' ? null : Number(input)
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
      setDividendType(DIVIDEND_TYPE_UNSPECIFIED)
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
      const res = await fetch('/api/dividends', {
        method: 'POST',
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
              証券会社の配当明細をそのまま写します。数量は現在の保有株数ではなく明細の数量を入力してください（配当は権利確定日の株数で決まるため）。税額合計か受取金額のどちらかを入れると残りが埋まります。
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
