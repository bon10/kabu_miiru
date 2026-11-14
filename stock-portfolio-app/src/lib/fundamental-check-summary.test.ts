import { describe, expect, it } from 'vitest'
import {
  countSellStatuses,
  countTriggeredItems,
  isTriggeredItem,
} from '@/lib/fundamental-check-summary'
import type { SellItem, SellStatus } from '@/lib/sell-signal'

const item = (
  key: SellItem['key'],
  status: SellItem['status'],
  label = key === 'roe' ? 'ROE' : key === 'equityRatio' ? '自己資本比率' : '有利子負債倍率',
): SellItem => ({
  key,
  label,
  thresholdLabel: '',
  status,
  firstPeriodEnd: null,
  firstPeriodValue: null,
  firstPeriodPrevious: null,
  latest: null,
  previous: null,
})

const signal = (status: SellStatus, items: SellItem[] = []) => ({ status, items })

describe('isTriggeredItem', () => {
  it('1 期目と 2 期続いているものを引き金とみなす', () => {
    expect(isTriggeredItem(item('roe', 'first_period'))).toBe(true)
    expect(isTriggeredItem(item('roe', 'consider_sell'))).toBe(true)
  })

  it('引き金なしとデータなしは含めない', () => {
    expect(isTriggeredItem(item('roe', 'ok'))).toBe(false)
    expect(isTriggeredItem(item('roe', 'no_data'))).toBe(false)
  })
})

describe('countSellStatuses', () => {
  it('判定ごとに数える', () => {
    const counts = countSellStatuses([
      signal('consider_sell'),
      signal('consider_sell'),
      signal('first_period'),
      signal('ok'),
      signal('not_applicable'),
    ])
    expect(counts).toEqual({
      consider_sell: 2,
      first_period: 1,
      ok: 1,
      no_data: 0,
      not_applicable: 1,
    })
  })

  it('1 件も無い判定も 0 で返す', () => {
    expect(countSellStatuses([])).toEqual({
      consider_sell: 0,
      first_period: 0,
      ok: 0,
      no_data: 0,
      not_applicable: 0,
    })
  })
})

describe('countTriggeredItems', () => {
  it('引き金になっている項目を多い順に数える', () => {
    const counts = countTriggeredItems([
      signal('consider_sell', [item('roe', 'consider_sell'), item('debtToEquity', 'ok')]),
      signal('first_period', [item('roe', 'first_period'), item('debtToEquity', 'first_period')]),
    ])
    expect(counts).toEqual([
      { key: 'roe', label: 'ROE', count: 2 },
      { key: 'debtToEquity', label: '有利子負債倍率', count: 1 },
    ])
  })

  it('引き金が無ければ空', () => {
    expect(countTriggeredItems([signal('ok', [item('roe', 'ok')])])).toEqual([])
  })
})
