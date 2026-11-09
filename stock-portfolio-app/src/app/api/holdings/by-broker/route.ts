import { NextRequest } from 'next/server'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { loadHoldingRows, type HoldingRow } from '@/lib/holdings'
import { holdingFilterOptions, matchesHoldingFilter } from '@/lib/holdings-filter'

// 証券会社別の保有銘柄ビュー。
// 各証券会社のサマリと、その下の銘柄リストを返す。
// 1 銘柄ぶんの値（円換算・年初来配当）の作り方は loadHoldingRows を参照。
//   - デフォルト: 保有株数 > 0 の銘柄のみ（= 現保有）
//   - includeZero=true: 過去に保有していた銘柄も含める
//   - market / sector: 市場・セクターで絞り込む（sector=__unset__ でセクター未入力の銘柄）。
//     合計も絞り込んだ銘柄だけで計算する。filterOptions は絞り込む前の銘柄から作る
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const includeZero = searchParams.get('includeZero') === 'true'
    const filter = {
      market: searchParams.get('market') ?? undefined,
      sector: searchParams.get('sector') ?? undefined,
    }

    const { rows: allRows } = await loadHoldingRows({ includeZero })

    const filterOptions = holdingFilterOptions(allRows)
    const rows = allRows.filter((r) => matchesHoldingFilter(r, filter))

    // 証券会社名はグループの見出しに出すので、各行には含めない
    type BrokerHoldingRow = Omit<HoldingRow, 'brokerName' | 'lastPriceUpdate'>

    type BrokerGroup = {
      brokerName: string
      stockCount: number
      totalInvestment: number
      totalCurrentValue: number
      totalProfitLoss: number
      totalProfitLossRate: number
      totalYtdDividend: number
      holdings: BrokerHoldingRow[]
    }

    const brokerMap = new Map<string, BrokerGroup>()

    for (const r of rows) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { brokerName, lastPriceUpdate, ...row } = r

      const group = brokerMap.get(brokerName) ?? {
        brokerName,
        stockCount: 0,
        totalInvestment: 0,
        totalCurrentValue: 0,
        totalProfitLoss: 0,
        totalProfitLossRate: 0,
        totalYtdDividend: 0,
        holdings: [],
      }
      group.stockCount += 1
      group.totalInvestment += row.investmentAmount
      group.totalCurrentValue += row.currentValue
      group.totalProfitLoss += row.profitLoss
      group.totalYtdDividend += row.ytdDividend
      group.holdings.push(row)
      brokerMap.set(brokerName, group)
    }

    const brokers = Array.from(brokerMap.values())
      .map((b) => ({
        ...b,
        totalProfitLossRate:
          b.totalInvestment > 0 ? (b.totalProfitLoss / b.totalInvestment) * 100 : 0,
      }))
      .sort((a, b) => b.totalInvestment - a.totalInvestment)

    const grand = brokers.reduce(
      (acc, b) => {
        acc.totalInvestment += b.totalInvestment
        acc.totalCurrentValue += b.totalCurrentValue
        acc.totalProfitLoss += b.totalProfitLoss
        acc.totalYtdDividend += b.totalYtdDividend
        acc.totalStocks += b.stockCount
        return acc
      },
      {
        totalInvestment: 0,
        totalCurrentValue: 0,
        totalProfitLoss: 0,
        totalProfitLossRate: 0,
        totalYtdDividend: 0,
        totalStocks: 0,
        brokerCount: brokers.length,
      },
    )
    grand.totalProfitLossRate =
      grand.totalInvestment > 0 ? (grand.totalProfitLoss / grand.totalInvestment) * 100 : 0

    return Response.json(
      createSuccessResponse({ brokers, grandTotal: grand, filterOptions }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
