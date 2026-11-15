'use client'

import { useEffect, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { todayInput } from '@/lib/date-key'
import { formatDate } from '@/lib/utils'

// 銘柄詳細画面の株式分割・併合の UI（ADR 0024）。置き場所が 3 つに分かれる。
// - StockSplitFormDialog：画面上部の「株式分割」ボタンから開く手入力の登録欄
// - StockSplitCandidateBanner：Yahoo Finance から取った未登録の分割の候補。見落とさないよう画面上部に出す
// - StockSplitHistoryCard：登録済みの分割の一覧と削除。取引履歴の隣に出す

interface SplitTerms {
  splitDate: string
  fromShares: number
  toShares: number
}

interface SplitRow extends SplitTerms {
  id: number
  memo: string | null
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

const splitsKey = (stockId: number) => `/api/stocks/${stockId}/splits`
const candidatesKey = (stockId: number) => `/api/stocks/${stockId}/splits/candidates`

const ratioLabel = (fromShares: number, toShares: number) =>
  `${fromShares.toLocaleString()}株 → ${toShares.toLocaleString()}株`

interface StockSplitProps {
  stockId: number
  // 分割の登録・削除で保有株数と平均取得単価が変わるため、親に再取得させる
  onChanged: () => void
}

// 登録・削除のあと、3 つの部品が見ている一覧と候補をまとめて取り直す。
// 部品ごとに取り直すと、登録した分割が候補の帯に残ったままになる。
function useRefreshSplits({ stockId, onChanged }: StockSplitProps) {
  const { mutate } = useSWRConfig()
  return () => {
    mutate(splitsKey(stockId))
    mutate(candidatesKey(stockId))
    onChanged()
  }
}

// 成功なら null、失敗なら画面に出す文言を返す
async function registerSplit(
  stockId: number,
  terms: SplitTerms,
  memo: string,
): Promise<string | null> {
  try {
    const res = await fetch(splitsKey(stockId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...terms, memo }),
    })
    if (res.ok) return null
    const json = await res.json().catch(() => null)
    return json?.error?.message ?? '登録に失敗しました'
  } catch (e) {
    console.error('株式分割の登録エラー:', e)
    return '登録に失敗しました'
  }
}

interface StockSplitFormDialogProps extends StockSplitProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StockSplitFormDialog({
  open,
  onOpenChange,
  stockId,
  onChanged,
}: StockSplitFormDialogProps) {
  const refresh = useRefreshSplits({ stockId, onChanged })
  const [splitDate, setSplitDate] = useState('')
  const [fromShares, setFromShares] = useState('1')
  const [toShares, setToShares] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 前回の入力やエラーを、開き直したときに残さない
  useEffect(() => {
    if (!open) return
    setSplitDate('')
    setFromShares('1')
    setToShares('')
    setMemo('')
    setError(null)
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const message = await registerSplit(
      stockId,
      { splitDate, fromShares: Number(fromShares), toShares: Number(toShares) },
      memo,
    )
    setSubmitting(false)
    if (message) {
      setError(message)
      return
    }
    refresh()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>株式分割・併合を登録</DialogTitle>
          <DialogDescription>
            分割日より前から持っている株数を比率で換算して、保有株数と平均取得単価を出し直します。取引履歴は買ったときの株数・単価のまま残ります。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="block font-medium">分割日（権利落ち日）</span>
            <Input
              type="date"
              required
              max={todayInput()}
              value={splitDate}
              onChange={(e) => setSplitDate(e.target.value)}
            />
            <span className="block text-xs text-muted-foreground">
              株価が分割後の水準に変わった最初の営業日です。
            </span>
          </label>
          <div className="flex items-end gap-3">
            <label className="flex-1 space-y-1 text-sm">
              <span className="block font-medium">分割前の株数</span>
              <Input
                type="number"
                required
                min="0"
                step="any"
                value={fromShares}
                onChange={(e) => setFromShares(e.target.value)}
              />
            </label>
            <span className="pb-2 text-muted-foreground">→</span>
            <label className="flex-1 space-y-1 text-sm">
              <span className="block font-medium">分割後の株数</span>
              <Input
                type="number"
                required
                min="0"
                step="any"
                placeholder="2"
                value={toShares}
                onChange={(e) => setToShares(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="block font-medium">メモ</span>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            分割日より前の取引をすでに分割後の株数に書き換えてある場合は、先に元の株数・単価へ戻してから登録してください。そのまま登録すると二重に換算されます。
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '登録中...' : '分割を登録'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function StockSplitCandidateBanner({ stockId, onChanged }: StockSplitProps) {
  const refresh = useRefreshSplits({ stockId, onChanged })
  const { data } = useSWR<{ data: { candidates: SplitTerms[] } }>(
    candidatesKey(stockId),
    fetcher,
    { revalidateOnFocus: false },
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidates = data?.data.candidates ?? []
  if (candidates.length === 0 && !error) return null

  const handleRegister = async (candidate: SplitTerms) => {
    setSubmitting(true)
    setError(null)
    const message = await registerSplit(stockId, candidate, '')
    setSubmitting(false)
    if (message) {
      setError(message)
      return
    }
    refresh()
  }

  return (
    <div className="space-y-2">
      {candidates.map((candidate) => (
        <div
          key={candidate.splitDate}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm"
        >
          <div>
            <p>
              Yahoo Finance に未登録の分割があります：{formatDate(candidate.splitDate)} に{' '}
              {ratioLabel(candidate.fromShares, candidate.toShares)}
            </p>
            <p className="text-xs text-muted-foreground">
              分割日より前の取引をすでに分割後の株数に書き換えてある場合は、先に元の株数・単価へ戻してください（そのまま登録すると二重に換算されます）。
            </p>
          </div>
          <Button size="sm" disabled={submitting} onClick={() => handleRegister(candidate)}>
            この内容で登録
          </Button>
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function StockSplitHistoryCard({ stockId, onChanged }: StockSplitProps) {
  const refresh = useRefreshSplits({ stockId, onChanged })
  const { data } = useSWR<{ data: { splits: SplitRow[] } }>(splitsKey(stockId), fetcher)
  const { data: settingsData } = useSWR<{ data: { allowTransactionEdit: boolean } }>(
    '/api/settings',
    fetcher,
  )

  // 分割の削除は取引履歴の編集・削除と同じ設定で許可する。既定は無効。
  const allowEdit = settingsData?.data.allowTransactionEdit ?? false
  const splits = data?.data.splits ?? []
  if (splits.length === 0) return null

  const handleDelete = async (split: SplitRow) => {
    if (
      !confirm(
        `${formatDate(split.splitDate)} の分割（${ratioLabel(split.fromShares, split.toShares)}）を削除しますか？`,
      )
    )
      return
    try {
      const res = await fetch(`${splitsKey(stockId)}/${split.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        alert(json?.error?.message ?? '削除に失敗しました')
        return
      }
      refresh()
    } catch (e) {
      console.error('株式分割の削除エラー:', e)
      alert('削除に失敗しました')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>株式分割・併合 ({splits.length}件)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>分割日</TableHead>
              <TableHead>比率</TableHead>
              <TableHead>メモ</TableHead>
              {allowEdit && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {splits.map((split) => (
              <TableRow key={split.id}>
                <TableCell>{formatDate(split.splitDate)}</TableCell>
                <TableCell>{ratioLabel(split.fromShares, split.toShares)}</TableCell>
                <TableCell>{split.memo || '-'}</TableCell>
                {allowEdit && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="この分割を削除"
                      onClick={() => handleDelete(split)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
