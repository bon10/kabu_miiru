# デプロイ手順（Vercel + TiDB Cloud）

構成と選定理由は [ADR 0013](./7-adr/0013-deploy-vercel-tidb.md) を参照。ここは実際に辿る手順だけを置く。

| 役割 | サービス |
| --- | --- |
| アプリ | Vercel Hobby |
| DB | TiDB Cloud Starter |
| cron | Vercel Cron（1 日 1 回） |
| 認証 | NextAuth + Google（許可メールアドレス 1 件） |

前提：本リポジトリの Next.js アプリは `stock-portfolio-app/` にある。Vercel の **Root Directory** をこのディレクトリに設定する。`vercel.json` もここに置いてある。

---

## 1. TiDB Cloud Starter を用意する

1. [TiDB Cloud](https://tidbcloud.com/) でクラスタを作る（リージョンは任意。`ap-northeast-1` が近い）
2. **Connect** から接続情報を開き、**Prisma** を選んで接続文字列をコピーする
3. データベース（例：`stock_portfolio`）を作る
4. 接続文字列に `?sslaccept=strict` が入っていることを確認する。パブリックエンドポイントでは TLS が必須で、これが無いと接続できない

```
mysql://xxxxx.root:PASSWORD@gateway01.xxxx.prod.aws.tidbcloud.com:4000/stock_portfolio?sslaccept=strict
```

### スキーマを作る

ローカルから TiDB を向けて `db:push` する。

```bash
cd stock-portfolio-app
DATABASE_URL='mysql://...tidbcloud.com:4000/stock_portfolio?sslaccept=strict' pnpm db:push
```

> `.env` の `DATABASE_URL` は書き換えず、コマンドの前に付けて一時的に上書きする。ローカル開発をローカル MySQL のまま続けられる。

---

## 2. データを移送する

日次終値（27,202 件）と日次 USD/JPY レートは**運ばない**。Yahoo Finance から取り直せるうえ、ローカルの既存レコードは日付が 1 日前にずれているため（[ADR 0012](./7-adr/0012-date-key-in-jst.md)）。

```bash
cd stock-portfolio-app

export SOURCE_DATABASE_URL='mysql://root:root_password@localhost:3406/stock_portfolio'
export TARGET_DATABASE_URL='mysql://...tidbcloud.com:4000/stock_portfolio?sslaccept=strict'

# 件数の確認だけ
node scripts/migrate-to-remote-db.js

# 実際に書き込む
node scripts/migrate-to-remote-db.js --apply
```

運ぶのは 証券会社 / 銘柄 / 取引 / 配当 / 価格履歴 / アプリ設定 の 6 テーブル。`id` を保ったまま入れるので `Transaction.stockId` などの参照はそのまま使える。移送先に既に銘柄があると止まる（`--force` で続行できるが、既存 id は上書きせず飛ばす）。

暦日を表す列（`transactionDate` / `paymentDate` / `firstPurchaseDate` / `purchaseDate` / `saleDate`）は `DATE` 型なので時刻を持たず、そのまま運べば揃ったまま入る。

> `DATE` 型へ移す前に取ったダンプを移送元にする場合に備えて、移送スクリプトは時刻の正規化も行う（揃っていれば何もしない）。揃えた件数は実行時に表示される。

### `$transaction` が動くか確かめる（TiDB での動作は未検証）

本アプリは取引の登録・編集で `$transaction` を使っている。TiDB でこれが通らないと、保有株数と平均取得単価が不整合なまま確定しうる。**アプリを公開する前に**、`$transaction` を使う[初期残高バッチ](../src/lib/initial-balance.ts)を dry-run して確認する。

```bash
curl -X POST -H "X-API-Key: $BATCH_API_KEY" {本番URL}/api/batch/initial-balance
```

エラーになる場合は Neon（PostgreSQL）へ切り替える（[ADR 0013](./7-adr/0013-deploy-vercel-tidb.md) の案B）。

---

## 3. Google OAuth に本番 URL を登録する

Google Cloud Console > APIとサービス > 認証情報 > 対象の OAuth クライアント ID を開き、**承認済みのリダイレクト URI** に本番ぶんを追加する。

```
{本番URL}/api/auth/callback/google
```

ローカル用（`http://localhost:3300/api/auth/callback/google`）は消さず、両方残す。

> 本番 URL は Vercel プロジェクトを作らないと決まらない。先に手順 4 でプロジェクトを作って URL を確定させてから戻ってきてもよい。

---

## 4. Vercel プロジェクトを作る

1. Vercel でリポジトリを import する
2. **Root Directory** に `stock-portfolio-app` を指定する
3. Framework Preset は Next.js（自動判定される）

### 環境変数を設定する

Settings > Environment Variables で、**Production** に次を登録する。

| 変数 | 値 | 未設定・誤設定だとどうなるか |
| --- | --- | --- |
| `DATABASE_URL` | TiDB の接続文字列（`sslaccept=strict` 付き） | DB に繋がらない |
| `NEXTAUTH_URL` | 本番 URL（`https://xxxxx.vercel.app`） | ログインのコールバックが失敗する。加えて**ダッシュボードと資産推移の画面が 500 になる**（サーバー側から自分の `/api/*` を呼ぶときのベース URL を兼ねているため） |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` の出力 | セッションを偽造されうる |
| `GOOGLE_CLIENT_ID` | Google OAuth のクライアント ID | ログインできない |
| `GOOGLE_CLIENT_SECRET` | 同シークレット | ログインできない |
| `ALLOWED_LOGIN_EMAIL` | 自分のメールアドレス | **全員拒否される**（設定漏れで全開放にならないための挙動） |
| `BATCH_API_KEY` | 任意のランダム文字列 | バッチの手動実行（POST）ができない |
| `CRON_SECRET` | 16 文字以上のランダム文字列 | **cron が 401 で失敗し続ける**（未設定なら誰でも叩ける状態にしないため常に拒否する） |

> `TZ` は設定しない。Vercel の予約環境変数で登録できず、暦日はコード側で JST 固定にしてある（[ADR 0012](./7-adr/0012-date-key-in-jst.md)）。

環境変数を後から足した場合は、反映のために再デプロイが要る。

### デプロイする

```bash
cd stock-portfolio-app
vercel --prod
```

または、対象ブランチを push して Vercel の自動デプロイに任せる。

---

## 5. 日次終値を入れ直す

移送していない日次終値と日次レートを、2 年ぶんまとめて取り込む。既存レコードは上書きしないので、何度実行しても安全。

```bash
curl -X POST \
  -H "X-API-Key: $BATCH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"range":"2y"}' \
  {本番URL}/api/batch/daily-close
```

保有銘柄ぶんを直列で取りに行くため 1 分前後かかる。`dailyPrice.failedCount` が 0 であることを確認する。

---

## 6. デプロイ後の確認

- [ ] 未認証で `{本番URL}` を開くとログイン画面に飛ぶ
- [ ] `ALLOWED_LOGIN_EMAIL` の Google アカウントでログインできる
- [ ] 別の Google アカウントではログインを拒否される
- [ ] ダッシュボードに数字が出る（サーバー側の自己 API 呼び出しが 401 になっていない）
- [ ] 資産推移グラフが描画される
- [ ] `/api/portfolio/timeline` の日付がローカル実行時と一致する（暦日が JST で判定されていることの確認）
- [ ] 銘柄詳細に初回購入日が出る。NULL のままなら `node scripts/backfill-first-purchase-date.js --apply` を本番 DB に向けて 1 度だけ流す
- [ ] Settings > Cron Jobs に `/api/batch/daily-close` が登録されている
- [ ] 翌日、cron のログが成功で残り、日次終値が増えている

---

## cron について

`vercel.json` の `0 23 * * *`（UTC）で 1 日 1 回動く。**JST では 08:00〜08:59 のどこか**。

- Vercel の cron 式は常に UTC
- Hobby プランは 1 日 1 回まで。かつ指定した「時」のうち任意の分に起動する（負荷分散のため）
- この時刻を選んだのは、東京市場の大引け（前日 15:00 JST）と米国市場の引け（同日朝 5〜6 時 JST）が両方出そろっているため
- Vercel は失敗した cron を再試行しない。数日止まっても、バッチは `range`（既定 `1mo`）ぶんを遡って埋めるので 1 回叩けば取り戻せる

手で叩き直す場合：

```bash
curl -X POST -H "X-API-Key: $BATCH_API_KEY" -H "Content-Type: application/json" \
  -d '{"range":"1mo"}' {本番URL}/api/batch/daily-close
```

---

## ローカル DB について

ローカルの `DailyPrice` / `ExchangeRate` は、暦日キーの変更（[ADR 0012](./7-adr/0012-date-key-in-jst.md)）より前に入れたレコードが 1 日前の日付のまま残っている。そのまま使っても動くが、本番と営業日の見え方が揃わない。揃えたい場合は入れ直す。

```bash
docker exec stock-portfolio-mysql mysql -uroot -p{パスワード} stock_portfolio \
  -e "DELETE FROM DailyPrice; DELETE FROM ExchangeRate;"

curl -X POST -H "X-API-Key: $BATCH_API_KEY" -H "Content-Type: application/json" \
  -d '{"range":"2y"}' http://localhost:3300/api/batch/daily-close
```
