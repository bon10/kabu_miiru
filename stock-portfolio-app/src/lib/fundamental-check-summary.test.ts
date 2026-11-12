import { describe, expect, it } from 'vitest'
import type { CheckItem, FundamentalCheck } from '@/lib/fundamental-check'
import {
  countCheckStatuses,
  countUnmetItems,
  isUnmetItem,
} from '@/lib/fundamental-check-summary'

function item(
  key: CheckItem['key'],
  label: string,
  status: CheckItem['status'],
): CheckItem {
  return { key, label, thresholdLabel: '', current: null, purchase: null, status }
}

function check(status: FundamentalCheck['status'], items: CheckItem[]): FundamentalCheck {
  return { status, items, notes: [] }
}

describe('isUnmetItem', () => {
  it('基準割れと購入時から未達を「届いていない」とみなす', () => {
    expect(isUnmetItem(item('roe', 'ROE', 'broken'))).toBe(true)
    expect(isUnmetItem(item('roe', 'ROE', 'unmet_since_purchase'))).toBe(true)
  })

  it('満たしている項目とデータなしの項目は含めない', () => {
    expect(isUnmetItem(item('roe', 'ROE', 'ok'))).toBe(false)
    expect(isUnmetItem(item('roe', 'ROE', 'no_data'))).toBe(false)
  })
})

describe('countCheckStatuses', () => {
  it('判定ごとの件数を数え、無い判定は 0 にする', () => {
    const counts = countCheckStatuses([
      check('broken', []),
      check('unmet', []),
      check('unmet', []),
      check('not_applicable', []),
    ])

    expect(counts).toEqual({
      ok: 0,
      broken: 1,
      unmet: 2,
      no_data: 0,
      not_applicable: 1,
    })
  })
})

describe('countUnmetItems', () => {
  it('届いていない項目を項目ごとに数え、多い順に並べる', () => {
    const counts = countUnmetItems([
      check('unmet', [
        item('roe', 'ROE', 'unmet_since_purchase'),
        item('fcfYield', 'FCF利回り', 'unmet_since_purchase'),
        item('trend', '200日線', 'ok'),
      ]),
      check('broken', [
        item('fcfYield', 'FCF利回り', 'broken'),
        item('trend', '200日線', 'no_data'),
      ]),
      check('ok', [item('roe', 'ROE', 'ok')]),
    ])

    expect(counts).toEqual([
      { key: 'fcfYield', label: 'FCF利回り', count: 2 },
      { key: 'roe', label: 'ROE', count: 1 },
    ])
  })

  it('届いていない項目が無ければ空にする', () => {
    expect(countUnmetItems([check('ok', [item('roe', 'ROE', 'ok')])])).toEqual([])
  })
})
