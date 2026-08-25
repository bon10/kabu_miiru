import { describe, it, expect } from 'vitest'
import {
  addDays,
  dateKeyOf,
  dateKeyParts,
  formatDateKey,
  jstMinutesOfDay,
  toDateKey,
} from '@/lib/date-key'

// 暦日キー（ADR 0012）。
//
// 入力はすべて絶対時刻（Z 付き ISO）で書く。ローカル暦日で組み立てると、
// テスト自体が実行環境のタイムゾーンに依存してしまい、
// 「サーバーの TZ に依存しない」という性質を検証できないため。

describe('toDateKey', () => {
  it('JST の暦日に丸める', () => {
    // 2025-09-10 09:00 JST
    expect(formatDateKey(toDateKey(new Date('2025-09-10T00:00:00Z')))).toBe('2025-09-10')
  })

  it('JST の 0 時ちょうどはその日に含める', () => {
    // 2025-09-10 00:00 JST = 2025-09-09 15:00Z
    expect(formatDateKey(toDateKey(new Date('2025-09-09T15:00:00Z')))).toBe('2025-09-10')
  })

  it('JST の 23:59:59 は翌日に繰り上がらない', () => {
    // 2025-09-10 23:59:59 JST = 2025-09-10 14:59:59Z
    expect(formatDateKey(toDateKey(new Date('2025-09-10T14:59:59Z')))).toBe('2025-09-10')
  })

  it('JST で日付が変わると翌日のキーになる', () => {
    // 2025-09-11 00:00 JST = 2025-09-10 15:00Z
    expect(formatDateKey(toDateKey(new Date('2025-09-10T15:00:00Z')))).toBe('2025-09-11')
  })

  it('同じ JST 暦日の異なる時刻は同一キーになる', () => {
    const morning = toDateKey(new Date('2025-09-10T00:30:00Z')) // JST 09:30
    const evening = toDateKey(new Date('2025-09-10T09:30:00Z')) // JST 18:30
    expect(morning.getTime()).toBe(evening.getTime())
  })

  it('暦日キーを渡しても同じキーを返す（DB から読み戻した値をそのまま扱えるように）', () => {
    const key = toDateKey(new Date('2025-09-10T00:00:00Z'))
    expect(toDateKey(key).getTime()).toBe(key.getTime())
  })

  // Prisma は @db.Date へ書くとき Date の UTC 日付部分を切り出す。JST 0 時
  // （= 前日 15:00Z）の Date を渡すと保存される日付が 1 日戻るため、
  // 暦日キーは UTC 0 時で持つ（ADR 0012）。
  it('内部表現は UTC の 0 時ちょうど', () => {
    expect(toDateKey(new Date('2025-09-10T05:00:00Z')).toISOString()).toBe(
      '2025-09-10T00:00:00.000Z',
    )
  })
})

describe('formatDateKey', () => {
  it('YYYY-MM-DD で表す', () => {
    expect(formatDateKey(dateKeyOf(2025, 8, 10))).toBe('2025-09-10')
  })

  it('月日を 2 桁ゼロ埋めする', () => {
    expect(formatDateKey(dateKeyOf(2025, 0, 5))).toBe('2025-01-05')
  })

  it('暦日キー以外の時刻を渡しても JST の暦日で表す', () => {
    // 2026-08-14 00:00 JST = 2026-08-13 15:00Z
    expect(formatDateKey(new Date('2026-08-13T15:00:00Z'))).toBe('2026-08-14')
  })
})

describe('dateKeyOf', () => {
  it('JST の年・月（0 起点）・日から暦日キーを作る', () => {
    expect(dateKeyOf(2026, 7, 14).toISOString()).toBe('2026-08-14T00:00:00.000Z')
  })

  it('日に 0 を渡すと前月末日になる（月ごとの日数を自前で判定しなくて済む）', () => {
    expect(formatDateKey(dateKeyOf(2026, 5, 0))).toBe('2026-05-31')
    expect(formatDateKey(dateKeyOf(2028, 2, 0))).toBe('2028-02-29')
  })

  it('月が範囲外なら年をまたいで繰り上げ・繰り下げする', () => {
    expect(formatDateKey(dateKeyOf(2026, -1, 10))).toBe('2025-12-10')
    expect(formatDateKey(dateKeyOf(2026, 12, 10))).toBe('2027-01-10')
  })
})

describe('dateKeyParts', () => {
  it('暦日キーから JST の年・月（0 起点）・日を取り出す', () => {
    expect(dateKeyParts(dateKeyOf(2026, 7, 14))).toEqual({ year: 2026, month: 7, day: 14 })
  })

  it('dateKeyOf と往復する', () => {
    const key = toDateKey(new Date('2026-08-13T15:00:00Z'))
    const { year, month, day } = dateKeyParts(key)
    expect(dateKeyOf(year, month, day).getTime()).toBe(key.getTime())
  })
})

describe('jstMinutesOfDay', () => {
  it('JST の 0 時ちょうどは 0 分', () => {
    // 2025-09-10 00:00 JST
    expect(jstMinutesOfDay(new Date('2025-09-09T15:00:00Z'))).toBe(0)
  })

  it('東京市場の寄り付き（09:00 JST）は 540 分', () => {
    expect(jstMinutesOfDay(new Date('2025-09-10T00:00:00Z'))).toBe(540)
  })

  it('大引け（15:00 JST）は 900 分', () => {
    expect(jstMinutesOfDay(new Date('2025-09-10T06:00:00Z'))).toBe(900)
  })

  it('JST の 23:59 は 1439 分（翌日に繰り上がらない）', () => {
    expect(jstMinutesOfDay(new Date('2025-09-10T14:59:00Z'))).toBe(1439)
  })
})

describe('addDays', () => {
  it('暦日キーを日単位で進める', () => {
    expect(formatDateKey(addDays(dateKeyOf(2026, 7, 14), 1))).toBe('2026-08-15')
  })

  it('負数で遡る', () => {
    expect(formatDateKey(addDays(dateKeyOf(2026, 7, 14), -14))).toBe('2026-07-31')
  })

  it('月末・年末をまたぐ', () => {
    expect(formatDateKey(addDays(dateKeyOf(2026, 11, 31), 1))).toBe('2027-01-01')
    expect(formatDateKey(addDays(dateKeyOf(2028, 1, 28), 1))).toBe('2028-02-29')
  })

  // 夏時間のある地域を経由すると 1 日 = 24 時間にならない日が生じる。
  // 暦日キーは UTC 0 時に揃えているため、日数の加算だけで暦日が進む。
  it('夏時間の切り替わりを跨いでも 1 日ずつ進む', () => {
    // 米国の夏時間開始（2026-03-08）を跨ぐ
    const days = [0, 1, 2].map((n) => formatDateKey(addDays(dateKeyOf(2026, 2, 7), n)))
    expect(days).toEqual(['2026-03-07', '2026-03-08', '2026-03-09'])
  })
})
