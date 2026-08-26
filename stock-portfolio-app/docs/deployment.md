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
2. 左ナビの **SQL Editor** を開き、データベースを作る。**接続情報を取りに行く前にこれをやる**（Connect ダイアログの Database は既存のデータベースしか選べないため）

   ```sql
   CREATE DATABASE stock_portfolio;
   ```

3. **Connect** を開き、次を選ぶ

   | 項目 | 選ぶもの | 理由 |
   | --- | --- | --- |
   | Connection Type | **Public Endpoint** | Private Endpoint は AWS PrivateLink 経由で自分の VPC 内からしか届かない。Vercel の実行環境からもローカルからも到達できない |
   | Branch | **main** | Branch は本体データを copy-on-write で複製した検証用インスタンス。本番として使うのは分岐元の `main` |
   | Database | **stock_portfolio** | ひとつ上の 2 で作ったもの |
   | Connect With | **Prisma** | Prisma 形式の接続文字列が出る |

4. **Generate Password** でパスワードを発行する。**一度しか表示されない**ので控えておく（無くしたら再発行すればよいが、既存の接続文字列は使えなくなる）
5. 表示された接続文字列をコピーし、`?sslaccept=strict` が入っていることを確認する。パブリックエンドポイントでは TLS が必須で、これが無いと接続できない

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

本アプリは取引の登録・編集で `$transaction` を使っている（[transactions](../src/app/api/transactions/route.ts) / [同 [id]](../src/app/api/transactions/[id]/route.ts) / [price-update](../src/app/api/batch/price-update/route.ts) / [initial-balance](../src/lib/initial-balance.ts)）。TiDB でこれが通らないと、保有株数と平均取得単価が不整合なまま確定しうる。**Vercel にデプロイする前に**、ローカルのアプリを TiDB に向けて確認する。

Vercel プロジェクトはまだ無いので本番 URL は使えない。ローカルの dev サーバーの接続先だけ TiDB に差し替えて叩く。

```bash
cd stock-portfolio-app
DATABASE_URL='mysql://...tidbcloud.com:4000/stock_portfolio?sslaccept=strict' pnpm dev
```

別のターミナルから、`$transaction` を使う[初期残高バッチ](../src/lib/initial-balance.ts)を実行する。

```bash
# 1. まず dry-run で作られる件数を確認する（DB は変更されない）
curl -X POST -H "X-API-Key: $BATCH_API_KEY" -H "Content-Type: application/json" \
  -d '{}' http://localhost:3300/api/batch/initial-balance

# 2. apply: true で実際に書き込む。$transaction を通るのはこちらだけ
curl -X POST -H "X-API-Key: $BATCH_API_KEY" -H "Content-Type: application/json" \
  -d '{"apply":true}' http://localhost:3300/api/batch/initial-balance
```

> **dry-run では `$transaction` を検証できない。** [initial-balance.ts:181](../src/lib/initial-balance.ts#L181) が `apply` でない場合に `$transaction` の手前で `continue` するため、`apply: true` で実行しないとトランザクションは一度も開かれない。初期残高の生成は ADR 0008 の移行作業そのものなので、ここで実行してしまってよい（何度実行しても結果は変わらない）。

成功条件は、レスポンスの `mismatches` が空であること。初期残高を作った後に再計算した保有株数・平均取得単価が移行前と一致したことを意味する。`$transaction` が TiDB で通らなければ、ここでエラーになる。

エラーになる場合は Neon（PostgreSQL）へ切り替える（[ADR 0013](./7-adr/0013-deploy-vercel-tidb.md) の案B）。**Vercel プロジェクトを作る前に分かる**ので、手戻りは接続文字列の差し替えだけで済む。

---

## 3. Vercel プロジェクトを作って本番 URL を確定させる

本番 URL は Vercel が採番するため、**先にプロジェクトを作らないと決まらない**。`NEXTAUTH_URL` と Google OAuth のリダイレクト URI はどちらもこの URL を必要とするので、先にここを済ませる。

1. Vercel でリポジトリを import する
2. **Root Directory** に `stock-portfolio-app` を指定する
3. Framework Preset は Next.js（自動判定される）

### 環境変数を設定する

Settings > Environment Variables で、**Production** に次を登録する。

| 変数 | 値 | 未設定・誤設定だとどうなるか |
| --- | --- | --- |
| `DATABASE_URL` | TiDB の接続文字列（`sslaccept=strict` 付き） | DB に繋がらない |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` の出力 | セッションを偽造されうる |
| `GOOGLE_CLIENT_ID` | Google OAuth のクライアント ID | ログインできない |
| `GOOGLE_CLIENT_SECRET` | 同シークレット | ログインできない |
| `ALLOWED_LOGIN_EMAIL` | 自分のメールアドレス | **全員拒否される**（設定漏れで全開放にならないための挙動） |
| `BATCH_API_KEY` | 任意のランダム文字列 | バッチの手動実行（POST）ができない |
| `CRON_SECRET` | 16 文字以上のランダム文字列 | **cron が 401 で失敗し続ける**（未設定なら誰でも叩ける状態にしないため常に拒否する） |

`NEXTAUTH_URL` はここでは登録しない。値になる本番 URL が、次のデプロイで初めて確定するため。手順 4 で登録する。

> `TZ` は設定しない。Vercel の予約環境変数で登録できず、暦日はコード側で JST 固定にしてある（[ADR 0012](./7-adr/0012-date-key-in-jst.md)）。

### デプロイして URL を確認する

```bash
cd stock-portfolio-app
vercel --prod
```

または、対象ブランチを push して Vercel の自動デプロイに任せる。

デプロイ後、Vercel のプロジェクト Overview に表示される本番 URL（`https://xxxxx.vercel.app`）を控える。

> **このデプロイではまだログインできない。** `NEXTAUTH_URL` が未設定で、Google 側にもリダイレクト URI が未登録のため。手順 4 まで進めば通るようになる。
>
> **`prisma generate` は `postinstall` で明示的に実行している。** Vercel 上では、`@prisma/client` のインストール時に走る自動生成を Prisma が信用せず、`Prisma has detected that this project was built on Vercel, which caches dependencies` を投げてビルドが落ちる。ログ上は生成が成功していても落ちるので紛らわしい。`package.json` の `postinstall` を消さないこと。
>
> **Next.js のバージョンが古いとデプロイがブロックされる。** Vercel は既知の脆弱性がある Next.js を検出すると `Build Failed / Vulnerable version of Next.js detected` で止める。`next build` 自体は成功し `Build Completed` まで出たあとに落ちるため、ビルドログを上から読むと原因が見つからない。落ちたら Next.js を v15 系の保守ライン（`npm view next dist-tags` の `backport`）まで上げる。

---

## 4. 本番 URL を NextAuth と Google OAuth に登録する

手順 3 で確定した本番 URL を、2 箇所に登録する。**カスタムドメインを割り当てている場合は、`xxxxx.vercel.app` ではなくカスタムドメインを使う。**

### Vercel 側

Settings > Environment Variables の **Production** に追加する。

| 変数 | 値 | 未設定・誤設定だとどうなるか |
| --- | --- | --- |
| `NEXTAUTH_URL` | 本番 URL（`https://example.com`。**必ず `https://` から書く**） | ログインのコールバックが失敗する。加えて**ダッシュボードと資産推移の画面が 500 になる**（サーバー側から自分の `/api/*` を呼ぶときのベース URL を兼ねているため） |

> **スキームまで正しく書くこと。** next-auth は `NEXTAUTH_URL` が `https://` で始まるかどうかでセッションクッキー名を切り替える（`__Secure-next-auth.session-token` か `next-auth.session-token` か）。`http://localhost:3300` のような値が残っていると、[middleware](../src/middleware.ts) の `getToken` が本番で書かれるクッキーとは別の名前を探すことになる。なお未設定の場合は `VERCEL` 環境変数へのフォールバックが効くため、**「設定漏れ」より「http のまま」のほうが検出しにくい**。

### ログインできない場合

**まず Vercel のランタイムログを見る。** [middleware](../src/middleware.ts) は、セッションクッキーが届いているのに復号できなかった場合に次を出力する。

```
セッションクッキーは届いているが復号できませんでした。
```

これが出ていれば、原因は `NEXTAUTH_SECRET` の不一致か、古い設定で発行されたクッキーの残存に絞られる。`NEXTAUTH_SECRET` を変更した場合、変更前に発行されたクッキーはすべて復号できなくなるため、ブラウザのクッキー削除で解消する。

出ていなければ、そもそもクッキーが届いていない。デプロイ済みの設定を `curl` で確認する。`__Host-` / `__Secure-` 付きのクッキー名が返れば `NEXTAUTH_URL` は `https://` で認識されている。`providers` の `callbackUrl` が実際に開いているドメインと一致しているかも見る。

```bash
curl -sS -o /dev/null -D - {本番URL}/api/auth/csrf | grep -i set-cookie
curl -sS {本番URL}/api/auth/providers
```

ログイン後の状態は次で確認できる（`/api/auth/*` は middleware の除外対象なので、認証で詰まっていても開ける）。

```
{本番URL}/api/auth/session
```

> **`ERR_TOO_MANY_REDIRECTS` について。** 2026-08-26 の本番で、ログイン後に無限リダイレクトが発生した（原因は特定できないまま解消）。当時は「ログイン済みか」を [middleware](../src/middleware.ts) の `getToken` と `login/page.tsx` の `getServerSession` の **2 か所で別々に判定**しており、両者が食い違うと `/` と `/login` が互いにリダイレクトし合う構造だった。画面が一切表示されないためログもエラーも見えず、切り分けができなかった。
>
> 現在は判定を middleware の `getToken` 1 か所に統合し、`/login` からセッション判定を削除してある。**同じ往復は構造的に発生しない。** ログイン画面へ通すか `/` へ戻すかも同じ `getToken` の結果で決まる。この統合を戻す変更（`/login` に `getServerSession` を足すなど）は、無限リダイレクトを再び持ち込むことになる。

### Google 側

Google Cloud Console > APIとサービス > 認証情報 > 対象の OAuth クライアント ID を開き、**承認済みのリダイレクト URI** に本番ぶんを追加する。

```
{本番URL}/api/auth/callback/google
```

ローカル用（`http://localhost:3300/api/auth/callback/google`）は消さず、両方残す。

### 再デプロイする

環境変数は**デプロイ時に焼き込まれる**ため、`NEXTAUTH_URL` を後から足しただけでは反映されない。もう一度デプロイする。

```bash
cd stock-portfolio-app
vercel --prod
```

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
