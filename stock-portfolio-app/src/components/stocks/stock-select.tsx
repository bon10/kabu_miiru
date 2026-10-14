'use client'

import { SearchableSelect } from '@/components/ui/searchable-select'

export interface StockSelectOption {
  id: number
  stockName: string
  code: string
  /**
   * 保有株数。渡したときだけラベルに保有株数を添える。
   * 受取配当の入力では現在の保有株数を使わないため省略する（ADR 0015）。
   */
  sharesHeld?: number
}

interface Props {
  stocks: StockSelectOption[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

// ラベルは銘柄名とコードを並べ、保有株数が渡された銘柄だけ末尾に添える。
function labelOf(stock: StockSelectOption): string {
  const base = `${stock.stockName}（${stock.code}）`
  return stock.sharesHeld === undefined
    ? base
    : `${base} / 保有 ${stock.sharesHeld}株`
}

/**
 * 銘柄を検索して選ぶコンボボックス。取引・受取配当の各フォームで同じ
 * ラベル書式・プレースホルダになるよう、銘柄向けの体裁をここに集約する。
 */
export function StockSelect({ stocks, value, onValueChange, disabled }: Props) {
  return (
    <SearchableSelect
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      placeholder="銘柄を選択"
      searchPlaceholder="銘柄名・コードで検索..."
      options={stocks.map((s) => ({
        value: String(s.id),
        label: labelOf(s),
        // ラベルの書式が変わってもコードで検索できるよう、コードを明示的に検索対象へ入れる
        keywords: s.code,
      }))}
    />
  )
}
