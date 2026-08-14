import { NextRequest } from 'next/server'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { backfillDailyPrices } from '@/lib/daily-price'
import { backfillUsdJpyRates } from '@/lib/exchange-rate'

// 日次終値・日次 USD/JPY レートの取り込みバッチ（ADR 0008）。
//
// range で指定した期間ぶんが 1 銘柄 1 リクエストで返るため、アプリを起動して
// いなかった期間もまとめて埋められる。日次更新も初回バックフィルも同じ経路で、
// 違いは range の長さだけ（既存レコードは上書きしないため重複実行しても安全）。
//
// 銘柄を直列で処理するので保有銘柄数に比例して時間がかかる。画面リクエストから
// ではなくバッチとして呼ぶこと。

// range 未指定時の既定。日次更新の想定で、数日止めていても取り戻せる長さにしている。
const DEFAULT_RANGE = '1mo'

// Yahoo Finance が受け付ける range。想定外の値を素通しさせないため列挙する。
const ALLOWED_RANGES = ['5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max']

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey || apiKey !== process.env.BATCH_API_KEY) {
      return Response.json(createErrorResponse('UNAUTHORIZED', 'Invalid API key'), {
        status: 401,
      })
    }

    const body = await request.json().catch(() => ({}))
    const range = body?.range ?? DEFAULT_RANGE

    if (!ALLOWED_RANGES.includes(range)) {
      return Response.json(
        createErrorResponse(
          'BAD_REQUEST',
          `range は次のいずれかを指定してください: ${ALLOWED_RANGES.join(', ')}`,
        ),
        { status: 400 },
      )
    }

    // 為替を先に取り込む。米国株の評価額は日次レートが揃っていないと
    // 円換算できず、終値だけ埋まってもグラフが描けないため。
    const rates = await backfillUsdJpyRates(range)
    const prices = await backfillDailyPrices(range)

    return Response.json(
      createSuccessResponse({
        executedAt: new Date().toISOString(),
        range,
        exchangeRate: rates,
        dailyPrice: {
          targetCount: prices.targetCount,
          successCount: prices.successCount,
          failedCount: prices.failedCount,
          savedCount: prices.savedCount,
          // 失敗した銘柄だけ返す。成功分まで並べると応答が保有銘柄数ぶん膨らむため
          failures: prices.results.filter((r) => !r.success),
        },
      }),
    )
  } catch (error) {
    return handleApiError(error)
  }
}
