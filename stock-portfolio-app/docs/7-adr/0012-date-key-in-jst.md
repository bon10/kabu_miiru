# ADR 0012: 日次データの暦日は JST で判定し、暦日キーは UTC 0 時の Date で持つ

## Status

Accepted (2026-08-26)

## Context

本アプリの日次データ（`DailyPrice.priceDate` / `ExchangeRate.rateDate`）と資産推移グラフの 1 点は、「東京市場の営業日」を単位にしている。この暦日をどう表現するかを決める必要がある。

決定を迫っているのは Issue #10（Vercel へのデプロイ）である。従来のコードは暦日を**サーバーのローカル時刻**で組み立てていた。

```ts
// 変更前
export function toDateKey(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
```

ローカル開発機は JST なので意図どおり動いていたが、次の 2 つの問題がある。

### 問題 1: Vercel の関数は UTC で動き、TZ では上書きできない

Vercel Functions のタイムゾーンは UTC である。そして `TZ` は Vercel の[予約環境変数](https://vercel.com/docs/environment-variables/reserved-environment-variables)で、プロジェクト環境変数として設定できない。つまり「環境変数で JST にする」という手が使えない。

ローカル時刻に頼ったままデプロイすると、暦日の境界が JST 0 時ではなく JST 9 時になり、既存データと噛み合わなくなる。

### 問題 2: JST の暦日 0 時を @db.Date に保存すると 1 日戻る

Prisma は MySQL の `DATE` 型へ書くとき、渡した `Date` の **UTC 側の日付部分**を切り出す。JST の暦日 0 時は UTC では前日 15:00 なので、保存される日付が 1 日戻る。ローカル DB に実際に書いて確認した結果は次のとおり。

| サーバー TZ | `new Date(2026, 0, 5)` の絶対時刻 | MySQL の DATE 列に入った値 |
| --- | --- | --- |
| Asia/Tokyo | `2026-01-04T15:00:00Z` | `2026-01-04` |
| UTC | `2026-01-05T00:00:00Z` | `2026-01-05` |

この結果、ローカル DB の日次データは実際の営業日より 1 日前の日付で記録されていた。曜日の分布がその裏付けになる（東京市場に土日の取引は無い）。

```text
DailyPrice（isFilled=0） 日 5037 / 月 5531 / 火 5584 / 水 5526 / 木 5524   金・土 0 件
ExchangeRate             日 104 / 月 105 / 火 104 / 水 103 / 木 102 / 金 4 / 土 3
```

一方 `Transaction.transactionDate` は `DateTime` 型（MySQL の `DATETIME`）なので絶対時刻がそのまま保存され、ずれていない。つまり資産推移の再構成では、**保有株数と終値が 1 日ぶん噛み合っていない**状態だった。

## 検討した代替案

- **案A（採用）：暦日キーという値を定義し、「JST の暦日」を「UTC 0 時の `Date`」で表す**
  - 生成・比較・書式化を [date-key.ts](../../src/lib/date-key.ts) に集約する
  - サーバーのタイムゾーンに依存しなくなり、Vitest で挙動を固定できる
  - `@db.Date` への保存と読み戻しで日付が一致するため、問題 2 も同時に解消する
- **案B：`instrumentation.ts` で `process.env.TZ = 'Asia/Tokyo'` を設定する**
  - Next.js のサーバー起動時フックで Node のタイムゾーンを変える。差分が最小で、Issue #10 が想定していた「環境変数で JST」に最も近い
  - ただし問題 2 は解消しない（JST 0 時を保存する構造が残るため、1 日ずれたまま）
  - 暦日の正しさが「起動時フックが必ず先に走ること」に依存し、テストでは固定できない。不採用
- **案C：`Intl.DateTimeFormat` に `timeZone: 'Asia/Tokyo'` を渡して暦日を求める**
  - タイムゾーン依存は解消でき、将来 JST 以外の市場を扱うなら素直な拡張になる
  - ただし日ごとのループで毎回フォーマッタを通すことになり、暦日キーを `Map` のキー（数値）として使っている現在の実装とは相性が悪い。JST は夏時間が無く固定オフセットなので、この複雑さに見合わない。不採用
- **案D：暦日を `Date` ではなく `'YYYY-MM-DD'` 文字列で持つ**
  - ずれようが無いのは確かだが、`@db.Date` 列との受け渡しで毎回変換が要り、日付の前後比較も文字列比較に頼ることになる。Prisma の型とも噛み合わない。不採用

## Decision

**暦日キー（JST の暦日を UTC 0 時の `Date` で表した値）を導入し、日次データの日付はすべてこれで扱う。**

- 実装は [date-key.ts](../../src/lib/date-key.ts) に集約する
  - `toDateKey(instant)` — 時刻を、それが属する JST 暦日のキーにする。DB から読み戻した `DATE` 値を渡しても同じキーを返す（べき等）
  - `formatDateKey(date)` — `YYYY-MM-DD`
  - `dateKeyOf(year, month, day)` / `dateKeyParts(key)` — JST の年月日との相互変換
  - `addDays(key, days)` — 日単位で進める。UTC には夏時間が無いため単純加算でよい
  - `jstMinutesOfDay(instant)` — JST の 0 時からの経過分。前場・後場の判定に使う
- `DailyPrice.priceDate` / `ExchangeRate.rateDate` に書く値は必ず暦日キーにする
- 「今日」「今月」「今年」の境目も JST の暦日で判定する（[取引サマリー](../../src/app/api/transactions/summary/route.ts) / [証券会社別保有](../../src/app/api/holdings/by-broker/route.ts)）
- 東京証券取引所の立会時間の判定も JST で行う（[getCurrentMarketSession](../../src/lib/stock-price.ts)）
- 対象は**サーバー側のコードだけ**。クライアントコンポーネント（取引一覧・配当一覧の絞り込み）はブラウザで動き、そこでのローカル時刻は閲覧者自身のタイムゾーンなので、`new Date()` のままでよい

### 理由

- 暦日の判定がサーバーのタイムゾーンから切り離され、ローカル（JST）でも Vercel（UTC）でも同じ結果になる。テストも `TZ=UTC` / `TZ=America/New_York` で通ることを確認している
- `@db.Date` への保存日と読み戻した暦日が一致するので、保存と読み取りで別の日付を指す状態が構造的に起きない
- 「暦日キー」という名前を付けたことで、`Date` が絶対時刻を指すのか暦日を指すのかがコード上で区別できる

## 決定していないこと

- **JST 以外の市場を暦日で扱う方法**。米国株も「東京市場の営業日」に載せて評価している（ADR 0009）。米国の営業日で別に集計する要求が出たら、暦日キーに市場の概念を持たせるか、案C の方向へ寄せるかを改めて決める
- **日付表示のタイムゾーンを何に紐づけるか**。[`formatDate`](../../src/lib/utils.ts) は `Asia/Tokyo` を直に指定している。本来は「その口座（証券会社）の所在地」に紐づくべきだが、口座がすべて日本の証券会社である現状では区別できないため、アプリ全体で固定した。**日本で使っている限り常に正しく見えるので、前提が崩れても気づきにくい**（見直しトリガー参照）
- **既存データの遡及修正**。ローカル DB の日次終値・為替レートの 1 日ずれたレコードは直さない。本番（TiDB）へは移送せず取り直す（ADR 0013）
- ~~**`Transaction.transactionDate` / `DividendHistory.paymentDate` の型**。`DateTime` のまま据え置く~~
  → **2026-08-26 に `@db.Date` へ変更した。** 暦日を表す 5 列（`transactionDate` / `paymentDate` / `firstPurchaseDate` / `purchaseDate` / `saleDate`）が対象。型が時刻を持てなくなったため、書き込み経路の違いで時刻が混在しなくなった。移行手順は [normalize-date-columns.js](../../scripts/normalize-date-columns.js)
- ~~**場中価格の履歴（`PriceHistory`）の集計単位**。週次・月次の間引きはローカル時刻で年・月を取っているまま~~
  → **2026-08-26 に修正した。** 実行環境のタイムゾーン依存に加えて、週キーが `年 + ceil(日 / 7)` だったため別の月が同じキーに衝突していた（1 年ぶんのデータでも週次グラフが最大 5 点になっていた）。`startOfWeekKey` で月曜始まりの週にまとめるようにした

## Consequences

- 日次終値と日次レートの保存日が、この変更の前後で 1 日変わる。**同じ DB に変更前後のレコードが混在すると、同じ営業日が 2 つの日付に分かれる**
  - 本番（TiDB）は移送せず取り直すため混在しない
  - ローカル DB は既存レコードが 1 日前のまま残る。営業日の見え方を本番と揃えたい場合は `DailyPrice` と `ExchangeRate` を空にしてから `POST /api/batch/daily-close {"range":"2y"}` で入れ直す
- 資産推移グラフで、保有株数と終値が同じ日に揃うようになる。過去のグラフの形も 1 日ぶん変わる
- `PriceHistory.marketSession` が UTC 環境でも正しく前場・後場になる。変更前にデプロイしていれば、立会時間中でもすべて `AFTER_HOURS` として記録されていた
- 新しく日付を扱うコードを書くときは、`new Date(y, m, d)` ではなく `dateKeyOf` を使うこと

### プレモーテム（この決定が誤っていた場合）

- 暦日キーは見た目がただの `Date` なので、`getFullYear()` などローカル時刻で読む関数に渡されると静かに 1 日ずれる。型では防げず、レビューと `date-key.ts` への集約でしか守れない
- JST 固定オフセット（+9 時間）を前提にしている。日本が夏時間を導入したら、この前提ごと崩れる（案C への移行が要る）
- 「暦日キーは UTC 0 時」という表現の理由は Prisma の `@db.Date` の挙動である。Prisma がこの挙動を変えると、変更前後でまた保存日がずれる

## 見直しトリガー

- **海外の証券会社（Robinhood・IBKR など）の口座を追加したとき**
  取引日・配当日は「その口座の帳簿上の日付」であり、日本の証券会社しか無いから JST で固定できている。海外口座が入ると、日付は口座ごと（あるいは取引所ごと）に決まるべきものになる。表示の固定（`formatDate` の `timeZone: 'Asia/Tokyo'`）とフォームの日付の初期値（`todayInput`）が、この前提に乗っている
  - **見落としが出やすい前提**でもある。JST 固定は日本で使っている限り常に正しく見えるため、崩れていても気づきにくい。海外口座を足すときは、日付を扱う箇所を洗い直すこと
- 所有者が日本国外に長期滞在し、現地の暦日で入力・閲覧したくなったとき（フォームの日付の初期値が日本時間の「今日」で固定されている）
- 東京市場以外の営業日カレンダーで集計する要求が出たとき
- Prisma のメジャーバージョンを上げるとき（`@db.Date` の変換挙動が変わっていないか確認する）
- 日本に夏時間が導入されたとき
- 日次データを JST 以外のタイムゾーンで表示したいという要求が出たとき

## 関連

- [時間と日付の扱い](../2-domain/time-and-dates.md)（本 ADR の決定を含む、時間まわりの仕様をまとめた文書）
- [ADR 0009 ポートフォリオ推移は日次終値から再構成する](0009-portfolio-timeline-from-daily-close.md)（暦日をキーにする設計の出どころ。「今日」の判定に関する記述を本 ADR で更新した）
- [ADR 0004 配当はカレンダー年で集計する](0004-dividend-period-calendar-year.md)（暦年・半期の境目を JST で判定するようにした。集計基準そのものは変えていない）
- [ADR 0005 米国株は当日レートで円換算](0005-us-stock-jpy-conversion.md)（`ExchangeRate.rateDate` の「1 日」の定義を JST に固定した）
- [ADR 0008 移行データの保有は初期残高 Transaction で表す](0008-initial-balance-transaction.md)（起点日 `DEFAULT_BASELINE_DATE` を暦日キーに直した）
- [ADR 0013 本番は Vercel + TiDB Cloud に置き、日次バッチは Vercel Cron で回す](0013-deploy-vercel-tidb.md)（UTC で動く実行環境と、取り直しの方針）
- [Vercel の予約環境変数](https://vercel.com/docs/environment-variables/reserved-environment-variables)（`TZ` が設定できないことの根拠）
