import { NextRequest } from 'next/server'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { startFundamentalCheck } from '@/lib/fundamental-store'

// 基準チェックの開始バッチ（ADR 0021）。
//
// 実行した日をチェック開始日として保存し、保有中の銘柄（ETF を除く）に、チェック開始日の値で
// 購入時の指標を 1 件ずつ作る。チェック開始日より後の買いは、取引の登録時に個別に作られる。
// 2 回目以降はチェック開始日を変えず、作れなかった銘柄だけを作り直すので、再実行しても安全。
//
// 既定は dry-run（DB を変更せず、作られる予定の銘柄だけを返す）。
// 実際に書き込むには body で { "apply": true } を渡す。
// 銘柄ごとに Yahoo へ 2 回問い合わせるため、銘柄数が多いと時間がかかる。
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey || apiKey !== process.env.BATCH_API_KEY) {
      return Response.json(createErrorResponse('UNAUTHORIZED', 'Invalid API key'), {
        status: 401,
      })
    }

    const body = await request.json().catch(() => ({}))
    const apply = body?.apply === true

    const summary = await startFundamentalCheck(apply)

    return Response.json(
      createSuccessResponse({
        ...summary,
        message: apply
          ? `チェック開始日 ${summary.checkStartDate}：${summary.createdCount} 件の購入時の指標を作成しました（失敗 ${summary.failed.length} 件）`
          : `dry-run：チェック開始日 ${summary.checkStartDate} で ${summary.targetCount} 件の購入時の指標が作成されます（apply: true で実行）`,
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
