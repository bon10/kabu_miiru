import { NextRequest } from 'next/server'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { buildPortfolioTimeline } from '@/lib/portfolio-timeline'
import { isTimelineRange, TIMELINE_RANGES } from '@/lib/timeline-range'

// ポートフォリオ推移 API（ADR 0009）。
//
// 日次で次の値を返す。いずれも保存値ではなく、取引履歴・日次終値・日次レートから
// 読み取り時に再構成した派生値：
//   - marketValue: その日の保有株を日次終値で評価した合計（時価）
//   - investedPrincipal: その日に投じている取得原価の合計
//   - unrealizedPL: 上記 2 つの差（評価損益）
//   - cumulativeRealizedPL: その日までの累計実現損益
//   - cumulativeDividends: その日までの累計配当受取（カレンダー年の集計は ADR 0004）
//
// 期間は range で指定する（thisMonth / lastMonth / 1y / 3y / 5y / all）。
// 「今日」の判定はサーバーのローカル暦日に依存するため、期間の解決はサーバー側で行う。
// 起点日（ADR 0008）より前は保有が不明なため返さない。
export async function GET(request: NextRequest) {
  try {
    const rangeParam = request.nextUrl.searchParams.get('range') ?? '1y'

    if (!isTimelineRange(rangeParam)) {
      return Response.json(
        createErrorResponse(
          'BAD_REQUEST',
          `range は次のいずれかを指定してください: ${TIMELINE_RANGES.map((r) => r.value).join(', ')}`,
        ),
        { status: 400 },
      )
    }

    const timeline = await buildPortfolioTimeline(rangeParam)

    return Response.json(createSuccessResponse(timeline))
  } catch (error) {
    return handleApiError(error)
  }
}
