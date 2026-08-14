import { NextRequest } from 'next/server'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { buildPortfolioTimeline } from '@/lib/portfolio-timeline'

// ポートフォリオ推移 API（ADR 0008）。
//
// 日次で次の値を返す。いずれも保存値ではなく、取引履歴・日次終値・日次レートから
// 読み取り時に再構成した派生値：
//   - marketValue: その日の保有株を日次終値で評価した合計（時価）
//   - investedPrincipal: その日に投じている取得原価の合計
//   - unrealizedPL: 上記 2 つの差（評価損益）
//   - cumulativeRealizedPL: その日までの累計実現損益
//   - cumulativeDividends: その日までの累計配当受取（カレンダー年の集計は ADR 0004）
//
// 起点日（ADR 0007）より前は保有が不明なため返さない。
export async function GET(request: NextRequest) {
  try {
    const monthsParam = request.nextUrl.searchParams.get('months')
    const months = monthsParam === 'all' ? null : parseInt(monthsParam ?? '24')

    const timeline = await buildPortfolioTimeline(Number.isNaN(months) ? 24 : months)

    return Response.json(createSuccessResponse(timeline))
  } catch (error) {
    return handleApiError(error)
  }
}
