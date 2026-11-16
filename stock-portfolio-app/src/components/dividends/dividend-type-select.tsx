'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DIVIDEND_TYPES, type DividendType } from '@/lib/dividend'

// Radix Select は空文字の値を持てないため、未指定（null）をこのセンチネルで表す。
const DIVIDEND_TYPE_UNSPECIFIED = '__none__'

// 選択肢に添える補足。どの銘柄で選ぶ種別かが名前だけでは伝わらないものに付ける。
const DIVIDEND_TYPE_HINTS: Partial<Record<DividendType, string>> = {
  四半期: '米国株など年4回',
  分配金: 'ETF・投信',
}

interface Props {
  // null は未指定。証券会社が期を示さず判別できないことがあるため未指定を許す。
  value: DividendType | null
  onValueChange: (value: DividendType | null) => void
}

export function DividendTypeSelect({ value, onValueChange }: Props) {
  return (
    <Select
      value={value ?? DIVIDEND_TYPE_UNSPECIFIED}
      onValueChange={(v) =>
        onValueChange(
          v === DIVIDEND_TYPE_UNSPECIFIED ? null : (v as DividendType)
        )
      }
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DIVIDEND_TYPE_UNSPECIFIED}>未指定</SelectItem>
        {DIVIDEND_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {type}
            {DIVIDEND_TYPE_HINTS[type] && `（${DIVIDEND_TYPE_HINTS[type]}）`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
