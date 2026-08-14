import { NextRequest } from 'next/server'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { createInitialBalances, findUnbackedSells } from '@/lib/initial-balance'

// 初期残高 Transaction の生成バッチ（ADR 0007）。
//
// TSV インポート由来の保有に「起点日にこの株数を保有していた」取引を 1 件ずつ作る。
// 一度きりの移行作業だが、何度実行しても結果が変わらないため再実行しても安全。
//
// 既定は dry-run（DB を変更せず、作られる予定の内容だけを返す）。
// 実際に書き込むには body で { "apply": true } を渡す。
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

    const summary = await createInitialBalances(apply)
    const unbackedSells = await findUnbackedSells()

    return Response.json(
      createSuccessResponse({
        ...summary,
        // 取得原価が失われていて自動復元できない銘柄。手動対応が必要
        unbackedSells,
        message: apply
          ? `${summary.createdCount} 件の初期残高を作成しました`
          : `dry-run: ${summary.createdCount} 件の初期残高が作成されます（apply: true で実行）`,
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
