import { prisma } from '@/lib/prisma'

// アプリ設定（Setting テーブル）へのアクセス。
// キー・バリュー形式で、真偽値の設定を扱う。

// 取引履歴の編集・削除を許可するか。誤操作防止のため既定は false（無効）。
export const ALLOW_TRANSACTION_EDIT = 'allowTransactionEdit'

// 設定キーの許可リスト。API から任意キーを書き込ませないため。
export const SETTING_KEYS = [ALLOW_TRANSACTION_EDIT] as const
export type SettingKey = (typeof SETTING_KEYS)[number]

export function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(key)
}

// 真偽値設定を取得する。未設定なら fallback（既定 false）を返す。
export async function getBooleanSetting(
  key: SettingKey,
  fallback = false,
): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key } })
  if (!row) return fallback
  return row.value === 'true'
}

// 真偽値設定を保存する（upsert）。
export async function setBooleanSetting(
  key: SettingKey,
  value: boolean,
): Promise<void> {
  const stringValue = value ? 'true' : 'false'
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: stringValue },
    update: { value: stringValue },
  })
}
