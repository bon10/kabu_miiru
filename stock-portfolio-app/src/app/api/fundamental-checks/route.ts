import { NextRequest } from 'next/server'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { formatDateKey } from '@/lib/date-key'
import { loadFundamentalChecks } from '@/lib/fundamental-store'

// 保有銘柄の基準チェック（ADR 0021）。
//   - 省略時：保有中の全銘柄（保有一覧の印に使う）
//   - stockId：その銘柄だけ（銘柄詳細の「基準チェック」欄に使う）
// DB を読むだけで、Yahoo には問い合わせない。値は最後に価格更新した時点のもの。
//
// 各行の sell は売りの判定（ADR 0023）。check（ADR 0021）とは比べる相手が違い、
// 購入時ではなく前の通期決算と比べる。画面はまだ check だけを使う。
export async function GET(request: NextRequest) {
  try {
    const stockId = Number(request.nextUrl.searchParams.get('stockId'))
    const rows = await loadFundamentalChecks(
      Number.isInteger(stockId) && stockId > 0 ? { stockIds: [stockId] } : {},
    )

    return Response.json(
      createSuccessResponse(
        rows.map((r) => ({
          ...r,
          lastPriceUpdate: r.lastPriceUpdate?.toISOString() ?? null,
          fiscalPeriodEnd: r.fiscalPeriodEnd ? formatDateKey(r.fiscalPeriodEnd) : null,
          fundamentalFetchedAt: r.fundamentalFetchedAt?.toISOString() ?? null,
          snapshot: r.snapshot
            ? { ...r.snapshot, recordedOn: formatDateKey(r.snapshot.recordedOn) }
            : null,
        })),
      ),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
