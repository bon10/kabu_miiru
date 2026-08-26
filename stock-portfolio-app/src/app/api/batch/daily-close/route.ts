import { NextRequest } from 'next/server'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import { backfillDailyPrices } from '@/lib/daily-price'
import { backfillUsdJpyRates } from '@/lib/exchange-rate'

// 日次終値・日次 USD/JPY レートの取り込みバッチ（ADR 0009）。
//
// range で指定した期間ぶんが 1 銘柄 1 リクエストで返るため、アプリを起動して
// いなかった期間もまとめて埋められる。日次更新も初回バックフィルも同じ経路で、
// 違いは range の長さだけ（既存レコードは上書きしないため重複実行しても安全）。
//
// 銘柄を直列で処理するので保有銘柄数に比例して時間がかかる。画面リクエストから
// ではなくバッチとして呼ぶこと。
//
// 呼び出し口は 2 つある（ADR 0013）。
//   - GET  : Vercel Cron 用。Vercel が Authorization: Bearer $CRON_SECRET を付けて叩く
//   - POST : 手動実行用。X-API-Key で認証し、range を body で渡す

// 保有銘柄ぶん Yahoo Finance を直列で叩くので、既定の関数タイムアウトでは
// 足りなくなりうる。Hobby プランで指定できる上限まで引き上げる。
export const maxDuration = 300

// range 未指定時の既定。日次更新の想定で、数日止めていても取り戻せる長さにしている。
const DEFAULT_RANGE = '1mo'

// Yahoo Finance が受け付ける range。想定外の値を素通しさせないため列挙する。
const ALLOWED_RANGES = ['5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'max']

// 日次終値とレートを取り込んで結果を返す。GET / POST で共通。
async function runBatch(range: string) {
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
}

const unauthorized = (message: string) =>
  Response.json(createErrorResponse('UNAUTHORIZED', message), { status: 401 })

// Vercel Cron からの定期実行。
//
// Vercel は cron を GET で呼び、プロジェクトに CRON_SECRET が設定されていれば
// その値を Authorization: Bearer として送る。CRON_SECRET が未設定のときは
// 誰でも叩ける状態になるため、認証情報が無い側ではなく本エンドポイントの側で拒否する。
export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error('CRON_SECRET が未設定のため日次終値バッチの GET を拒否しました')
      return unauthorized('Invalid cron secret')
    }
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return unauthorized('Invalid cron secret')
    }

    // cron からは body を渡せないため、range はクエリで受ける。
    return await runBatch(request.nextUrl.searchParams.get('range') ?? DEFAULT_RANGE)
  } catch (error) {
    return handleApiError(error)
  }
}

// 手動実行。初回バックフィル（range=2y など）や、cron の失敗後の取り戻しに使う。
export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey || apiKey !== process.env.BATCH_API_KEY) {
      return unauthorized('Invalid API key')
    }

    const body = await request.json().catch(() => ({}))
    return await runBatch(body?.range ?? DEFAULT_RANGE)
  } catch (error) {
    return handleApiError(error)
  }
}
