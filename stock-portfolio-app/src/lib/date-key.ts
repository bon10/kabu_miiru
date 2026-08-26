// 暦日キー（ADR 0012）。
//
// 本アプリの日次データ（DailyPrice.priceDate / ExchangeRate.rateDate）と、
// 推移グラフの 1 点は「東京市場の営業日」を単位にしている。この暦日を指す値を
// 暦日キーと呼び、生成・比較・書式化をすべてこのモジュールに集約する。
//
// 暦日キーは「JST の暦日」を「UTC 0 時の Date」で表す。2 つの理由がある。
//
//   1. 暦日の判定を JST に固定するため。Vercel の関数は UTC で動き、TZ は
//      Vercel の予約環境変数なのでプロジェクト設定では上書きできない。
//      サーバーのローカル時刻に頼ると、実行環境ごとに暦日の境界が変わる。
//   2. Prisma が MySQL の DATE 型（@db.Date）へ書くとき、渡した Date の
//      UTC 側の日付部分を切り出すため。JST 0 時（= 前日 15:00Z）の Date を
//      渡すと、保存される日付が 1 日戻る。UTC 0 時に揃えておけば、
//      保存した暦日と読み戻した暦日が一致する。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// 時刻を、それが属する JST 暦日のキーに変換する。
// DB から読み戻した DATE 値（UTC 0 時）を渡しても同じキーを返す。
export function toDateKey(instant: Date): Date {
  const jst = instant.getTime() + JST_OFFSET_MS
  return new Date(Math.floor(jst / DAY_MS) * DAY_MS)
}

// 暦日キーを YYYY-MM-DD で表す。
// 暦日キー以外の時刻を渡した場合も、その時刻が属する JST 暦日で表す。
export function formatDateKey(date: Date): string {
  return toDateKey(date).toISOString().slice(0, 10)
}

// JST の年・月（0 起点）・日から暦日キーを作る。
// 範囲外の月日は Date.UTC と同じく繰り上げ・繰り下げされるため、
// dateKeyOf(y, m, 0) で前月末日、dateKeyOf(y, 12, d) で翌年 1 月を得られる。
export function dateKeyOf(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day))
}

// 暦日キーから JST の年・月（0 起点）・日を取り出す。
export function dateKeyParts(key: Date): { year: number; month: number; day: number } {
  return {
    year: key.getUTCFullYear(),
    month: key.getUTCMonth(),
    day: key.getUTCDate(),
  }
}

// 時刻を JST のその日の 0 時からの経過分で表す（0〜1439）。
// 東京市場の前場・後場の判定に使う。
export function jstMinutesOfDay(instant: Date): number {
  return Math.floor((instant.getTime() + JST_OFFSET_MS - toDateKey(instant).getTime()) / 60_000)
}

// 日本時間の「今日」を YYYY-MM-DD で返す。<input type="date"> の初期値に使う。
// new Date().toISOString().slice(0, 10) だと世界標準時の今日になり、
// 日本時間の 0〜9 時のあいだ前日が初期値として入ってしまう。
export function todayInput(): string {
  return formatDateKey(new Date())
}

// 暦日キーが属する週の月曜日を返す。週単位でまとめるときのキーに使う。
// 暦日キーは UTC 0 時に揃えてあるため、1970-01-01（木曜）からの経過日数で
// 曜日が決まる。
export function startOfWeekKey(key: Date): Date {
  const epochDay = Math.floor(key.getTime() / DAY_MS)
  return addDays(key, -((epochDay + 3) % 7))
}

// 暦日キーを days 日ぶん進める（負数で遡る）。
// 暦日キーは UTC 0 時に揃えてあり UTC には夏時間が無いため、
// 日数の加算だけで暦日が 1 日ずつ動く。
export function addDays(key: Date, days: number): Date {
  return new Date(key.getTime() + days * DAY_MS)
}
