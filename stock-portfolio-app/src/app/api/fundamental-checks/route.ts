import { NextRequest } from 'next/server'
import { createSuccessResponse, handleApiError } from '@/lib/api-response'
import { formatDateKey } from '@/lib/date-key'
import { loadFundamentalChecks } from '@/lib/fundamental-store'

// 保有銘柄の基準チェック。
//   - 省略時：保有中の全銘柄（保有一覧の印に使う）
//   - stockId：その銘柄だけ（銘柄詳細の「基準チェック」欄に使う）
// DB を読むだけで、Yahoo には問い合わせない。値は最後に価格更新した時点のもの。
//
// **銘柄の判定は各行の sell ひとつ（ADR 0023）。** 前の通期決算と比べる。
// values は項目ごとの数字と「今、基準を満たすか」で、銘柄をどうするかは言わない。
// 購入時の値（ADR 0021）は values の列に残すが、判定には使わない。
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
