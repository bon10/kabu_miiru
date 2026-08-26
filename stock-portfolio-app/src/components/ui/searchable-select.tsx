'use client'

import * as React from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface SearchableSelectOption {
  value: string
  /** トリガーとリストに表示するラベル */
  label: string
  /** ラベル以外に検索対象へ含めたい文字列（銘柄コードなど） */
  keywords?: string
}

interface Props {
  options: SearchableSelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
}

// 検索の全角/半角・大文字小文字の揺れを吸収する。NFKC 正規化で全角英数字
// （例: ＭＩＸＩ）を半角へ揃え、そのうえで小文字化して比較する。
// 日本株の銘柄名に全角英字が混ざるため、ユーザーが半角で打っても一致させる。
function normalizeForSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

/**
 * 検索ボックス付きのコンボボックス。選択肢が多いときに絞り込めるよう、
 * Radix Select の代わりに使う。依存追加を避けるため自前で組んでいる。
 */
export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = '選択',
  searchPlaceholder = '検索...',
  emptyText = '該当する項目がありません',
  disabled,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  // キーボード操作でハイライト中の候補位置（フィルタ後配列に対する index）
  const [activeIndex, setActiveIndex] = React.useState(0)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = React.useMemo(() => {
    const q = normalizeForSearch(query.trim())
    if (!q) return options
    return options.filter((o) =>
      normalizeForSearch(`${o.label} ${o.keywords ?? ''}`).includes(q)
    )
  }, [options, query])

  // 開いたら検索欄へフォーカスし、絞り込み状態を初期化する。
  React.useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // ポップアップ描画後にフォーカスを当てる
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // 外側クリックで閉じる。Dialog 内でも動くよう document 全体を監視する。
  React.useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // 絞り込み結果が変わったらハイライト位置を先頭へ戻す。
  React.useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // ハイライト中の候補が常に見えるようスクロール追従させる。
  React.useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  function commit(index: number) {
    const option = filtered[index]
    if (!option) return
    onValueChange(option.value)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(activeIndex)
    } else if (e.key === 'Escape') {
      // ドロップダウンだけ閉じ、親の Dialog までは閉じさせない。
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={cn('line-clamp-1', !selected && 'text-muted-foreground')}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="flex h-10 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </p>
            ) : (
              filtered.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  data-index={index}
                  onClick={() => commit(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-left text-sm outline-none',
                    index === activeIndex && 'bg-accent text-accent-foreground'
                  )}
                >
                  {option.value === value && (
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
