import { NextRequest } from 'next/server'
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/api-response'
import {
  ALLOW_TRANSACTION_EDIT,
  getBooleanSetting,
  isSettingKey,
  setBooleanSetting,
} from '@/lib/settings'

// アプリ設定の取得。真偽値フラグをまとめて返す。
export async function GET() {
  try {
    const allowTransactionEdit = await getBooleanSetting(ALLOW_TRANSACTION_EDIT)
    return Response.json(createSuccessResponse({ allowTransactionEdit }))
  } catch (error) {
    return handleApiError(error)
  }
}

// アプリ設定の更新。{ key, value(boolean) } を受け取り upsert する。
// 許可リスト外のキーは拒否する。
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { key, value } = body

    if (typeof key !== 'string' || !isSettingKey(key)) {
      return Response.json(
        createErrorResponse('BAD_REQUEST', '不正な設定キーです'),
        { status: 400 },
      )
    }
    if (typeof value !== 'boolean') {
      return Response.json(
        createErrorResponse('BAD_REQUEST', 'value は真偽値である必要があります'),
        { status: 400 },
      )
    }

    await setBooleanSetting(key, value)
    return Response.json(createSuccessResponse({ key, value }))
  } catch (error) {
    return handleApiError(error)
  }
}
