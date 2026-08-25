# ADR 0013: 本番は Vercel + TiDB Cloud Starter に置き、日次バッチは Vercel Cron で回す

## Status

Accepted (2026-08-26)

## Context

本アプリはローカル（docker-compose + MySQL）でのみ動いており、日次終値の取り込みバッチ（ADR 0009）は手で叩いていた。デプロイすると次が得られる。

- どこからでも閲覧できる
- **cron が動かせる**（バッチの手動実行から解放される）

制約は 3 つ。

1. **費用は無料枠に収める**。所有者 1 人の家計簿的な用途で、月額を払う根拠が無い
2. **`$transaction` が動くこと**。[取引の登録・編集・削除](../../src/app/api/transactions/route.ts)と[初期残高の生成](../../src/lib/initial-balance.ts)は、集計の書き戻しを含めてトランザクションで囲っている。壊れると保有株数と平均取得単価が不整合なまま確定しうる
3. **`Decimal(15,4)` が表現できること**。金額・株数・レートをすべて `Decimal` で持っている

データ量は現在 DB 全体で 2.8 MB（うち日次終値 2.5 MB / 27,202 件）。日次終値の増加は年 約 1.3 MB（55 銘柄 × 約 250 営業日）。

## 検討した代替案

### アプリの実行環境

- **案A（採用）：Vercel Hobby**
  - Next.js のためのゼロ設定デプロイ。関数タイムアウトは Hobby でも[既定・上限とも 300 秒](https://vercel.com/docs/functions/configuring-functions/duration)で、実測 14 秒の日次バッチに十分
- **案B：Cloudflare Workers**
  - 無料枠が 1 リクエストあたり外部通信 50 回・CPU 10ms。日次終値バッチは 55 銘柄ぶんの外部通信が要るため超過する。銘柄ごとにジョブを分ければ回避できるが、55 個のジョブを起動する仕組み（Queues）が別途要り、構成が複雑になる。不採用

### データベース

- **案A（採用）：TiDB Cloud Starter**
  - MySQL 互換 5 GiB 無料。**Prisma スキーマを変更せずに載せ替えられる**
  - トランザクションに対応する（[制限は「1 トランザクション 30 分以内」](https://docs.pingcap.com/tidbcloud/serverless-limitations/)。本アプリの用途では当たらない）
  - 外部キーは [TiDB v6.6.0 から利用でき、v8.5.0 で GA](https://docs.pingcap.com/tidbcloud/dev-guide-sample-application-nodejs-prisma/)
- **案B：Neon（PostgreSQL）**
  - 0.5 GB・期限なし。数百年ぶん入る規模で、実績も厚い
  - ただし provider を `postgresql` に変える移行が要る。案A で載るなら払う必要の無いコスト。**案A が動かなかった場合の退避先**として残す
- **案C：Cloudflare D1**
  - Prisma 公式に「D1 はトランザクション非対応で、`$transaction` は無視され個別クエリとして実行されるため ACID 保証が壊れる」と明記されている。加えて SQLite では `Decimal(15,4)` を表現できない。制約 2・3 の両方に反する。不採用
- **案D：GCP Cloud SQL**
  - 最小構成でも月 $10 前後。制約 1 に反する。不採用

### cron

- **案A（採用）：Vercel Cron**
  - Hobby は[1 日 1 回まで、かつ指定した「時」のうち任意の分に起動する](https://vercel.com/docs/cron-jobs/manage-cron-jobs)（`0 23 * * *` なら 23:00〜23:59 UTC のどこか）。日次終値の取り込みには十分
  - アプリと同じリポジトリで完結し、追加のサービスが要らない
- **案B：GitHub Actions を cron 代わりに使う**
  - プライベートリポジトリでも月 2,000 分無料。1 日 1 回の curl なら月 30 分程度で収まる
  - 1 日 1 回では足りなくなったときの退避先として残す。今の要件では案A で足りるため不採用

## Decision

**アプリを Vercel Hobby、DB を TiDB Cloud Starter に置き、日次終値バッチを Vercel Cron で 1 日 1 回呼ぶ。**

### バッチの呼び出し口

Vercel Cron は **GET** で呼び、プロジェクトに `CRON_SECRET` が設定されていればその値を `Authorization: Bearer <CRON_SECRET>` として送る。既存のバッチは POST + `X-API-Key` だったため、[日次終値バッチ](../../src/app/api/batch/daily-close/route.ts)に GET を足した。

- **GET** — cron 用。`CRON_SECRET` で認証し、`range` はクエリで受ける
- **POST** — 手動実行用。`X-API-Key` で認証し、`range` は body で受ける（初回バックフィルや取り戻しに使う）

`CRON_SECRET` が未設定のときは GET を常に 401 にする。設定漏れで誰でもバッチを叩ける状態にしないため（`ALLOWED_LOGIN_EMAIL` 未設定なら全員拒否する ADR 0011 と同じ考え方）。

スケジュールは [vercel.json](../../vercel.json) に `0 23 * * *` で置く。**Vercel の cron 式は常に UTC** なので、これは JST の 08:00〜08:59 にあたる。この時刻を選んだのは、東京市場の大引け（前日 15:00 JST）と米国市場の引け（同日朝 5〜6 時 JST）の両方が出そろっているため。

### データ移送

銘柄・取引・配当・証券会社・価格履歴・アプリ設定は [migrate-to-remote-db.js](../../scripts/migrate-to-remote-db.js) で id を保ったまま運ぶ。

暦日を表す列（`transactionDate` / `paymentDate` / `firstPurchaseDate` / `purchaseDate` / `saleDate`）は `DATE` 型で時刻を持たないため、そのまま運べる。`DATE` 型へ移す前のダンプを移送元にした場合に備えて、移送スクリプトは時刻の正規化も行う。

**日次終値（27,202 件）と日次 USD/JPY レート（525 件）は運ばず、移送後に `range=2y` で取り直す。** Yahoo Finance から再取得できるうえ、ローカルの既存レコードは日付が 1 日前にずれているため（ADR 0012）、運び込むと本番にずれを持ち込むことになる。

### タイムゾーン

Vercel の関数は UTC で動き、`TZ` は予約環境変数のため設定できない。暦日は環境変数ではなくコード側で JST 固定にした（ADR 0012）。

## 決定していないこと

- **TiDB で `$transaction` が実際に通るか**。ドキュメント上は対応しているが、本アプリの `$transaction`（インタラクティブトランザクション）で動くかは**未検証**。デプロイ手順で `/api/batch/initial-balance` を dry-run して確認する。通らなければ案B（Neon）へ切り替える
- **カスタムドメイン**。`*.vercel.app` のまま。所有者しかログインできないため、覚えやすい URL である必要が無い
- **バックアップ**。TiDB Cloud Starter の既定に任せ、アプリ側でエクスポートの仕組みは持たない
- **cron 失敗時の通知**。Vercel は cron の失敗を再試行しない。気づく手段は今のところダッシュボードを見ることだけ
- **`/api/batch/price-update`（現在価格の更新）の cron 化**。Hobby は 1 日 1 回までで、枠を日次終値に使う
- **プレビューデプロイの扱い**。本番と同じ DB を向くかどうかを決めていない

## Consequences

- 本番環境変数として `DATABASE_URL`（TiDB）・`NEXTAUTH_URL`（本番 URL）・`NEXTAUTH_SECRET`・`GOOGLE_CLIENT_ID`・`GOOGLE_CLIENT_SECRET`・`ALLOWED_LOGIN_EMAIL`・`BATCH_API_KEY`・`CRON_SECRET` が要る。手順は [deployment.md](../deployment.md)
- TiDB のパブリックエンドポイントに繋ぐには `DATABASE_URL` に `sslaccept=strict` が要る（[TiDB × Prisma 公式ガイド](https://docs.pingcap.com/tidbcloud/dev-guide-sample-application-nodejs-prisma/)）
- Google Cloud Console の承認済みリダイレクト URI に `{本番URL}/api/auth/callback/google` を足す必要がある。ローカル用しか登録していないとログインできない
- `NEXTAUTH_URL` は NextAuth のコールバック先であると同時に、[ダッシュボード](../../src/app/page.tsx)と[資産推移画面](../../src/app/portfolio/page.tsx)がサーバー側から自分の `/api/*` を呼ぶときのベース URL でもある。誤ると画面が 500 になる
- cron は 1 日 1 回しか動かない。日中に価格を最新化したい場合は、これまでどおり画面から手で更新する

### プレモーテム（この決定が誤っていた場合）

- TiDB で `$transaction` が動かなければ、取引の登録・編集で保有株数と平均取得単価が不整合なまま確定しうる。**気づくのは数字が合わなくなってから**になる可能性がある。デプロイ手順で dry-run を先に通すのはこのため
- Vercel Hobby は商用利用が規約で禁じられている。本アプリを他人に使わせ始めた時点で規約に反する
- 無料枠は事業者の都合で変わる。TiDB Cloud Starter の 5 GiB か Vercel Hobby の条件が変われば、退避先（Neon / GitHub Actions）へ移すことになる
- cron が静かに止まっても気づく仕組みが無い。日次終値が数日欠けてから資産推移グラフの平坦さで気づく、という発見のされ方になる。ただしバッチは `range` ぶんを遡って埋めるため、気づいた時点で 1 回叩けば取り戻せる

## 見直しトリガー

- `/api/batch/initial-balance` の dry-run が TiDB で失敗したとき（→ Neon へ）
- 日次終値の取り込みが 1 日 1 回では足りなくなったとき（→ GitHub Actions へ）
- 日次バッチの実行時間が 300 秒に近づいたとき（保有銘柄が増えて直列処理が伸びたとき）
- TiDB Cloud Starter の使用量が無料枠（5 GiB）の半分を超えたとき
- 所有者以外が使い始めたとき（Vercel Hobby の規約に触れる）

## 関連

- [ADR 0009 ポートフォリオ推移は日次終値から再構成する](0009-portfolio-timeline-from-daily-close.md)（cron で回す対象のバッチ）
- [ADR 0011 ログインは Google のみ・許可メールアドレス 1 件・JWT セッションで実装する](0011-single-user-google-login.md)（公開前提の認証。`/api/batch/*` を保護対象外にしている）
- [ADR 0012 日次データの暦日は JST で判定し、暦日キーは UTC 0 時の Date で持つ](0012-date-key-in-jst.md)（UTC で動く実行環境への対応）
- [デプロイ手順](../deployment.md)
- Issue #10 アプリをデプロイして cron を動かせるようにする
