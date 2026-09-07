# ADR 0016: スキーマ変更は Prisma Migrate で行い、`db push` を使わない

## Status

Accepted (2026-09-04)

## Context

本アプリのスキーマ変更は、これまで `prisma db push` で反映していた。その結果 `prisma/migrations/` は 2025-09-10 の `20250910174318_init` 1 件のまま止まり、**それ以降の変更が一切記録されていない**状態になっていた。

実際、init の `DividendHistory` は次のとおりで、[ADR 0006](0006-dividend-receipt-currency.md) で追加した `currency` も、[ADR 0012](0012-date-key-in-jst.md) で `@db.Date` へ変えた `paymentDate` も入っていない。

```sql
CREATE TABLE `DividendHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stockId` INTEGER NOT NULL,
    `dividendAmount` DECIMAL(15, 2) NOT NULL,
    `paymentDate` DATETIME(3) NOT NULL,
    ...
```

`db push` はマイグレーションを読みも書きもしないため、これは想定どおりの結果である。

> `db push` does not interact with or rely on migrations. The migrations table `_prisma_migrations` will not be created or updated, and no migration files will be generated.
> — [Prototyping your schema | Prisma Docs](https://www.prisma.io/docs/orm/prisma-migrate/workflows/prototyping-your-schema)

問題は、**`migrations/` があるのに使われていない**ことである。ディレクトリの存在が「マイグレーション管理をしている」という誤解を生む。実際 [docs/4-db-design/0-overview.md](../4-db-design/0-overview.md) は「開発は `db push`、本番は `migrate`」と書いていたが、本番（TiDB Cloud）も `db push` で作られており、記述と実態が食い違っていた。

もう 1 つ、この判断に効いてくる制約がある。**ローカル MySQL は使っておらず、`.env` の `DATABASE_URL` は本番の TiDB Cloud を直接向いている。** つまり手元で打つ Prisma コマンドは、そのまま本番に当たる。

## 検討した代替案

- **案A（採用）：現状のスキーマを `0_init` としてベースライン化し、以後 Prisma Migrate に一本化する。** `db push` は使わない。
- **案B：`db push` 運用を追認し、`prisma/migrations/` を削除する。** 実態と一致し、コマンドが 1 つで済む。/ 不採用：変更履歴が残らず、いつ何を変えたかを追えない。スキーマの過去を復元する手段が git の `schema.prisma` だけになり、DB に当てた SQL は永久に残らない。
- **案C：`prisma migrate dev` でマイグレーション履歴を作り直す。** 最も素直。/ 不採用：**DB のリセットを求められる**（下記引用）。本番にデータがあるため実行できない。
  > The steps taken to reach the initial prototype are not preserved - `db push` does not generate a history.
- **案D：ローカル MySQL を復活させ、`migrate dev` はローカル、`migrate deploy` は本番、という教科書どおりの二段構えにする。** Prisma が想定する標準形。/ 不採用（現時点）：ローカル DB を使わない運用が定着しており、そのためだけに戻す動機が無い。将来必要になれば移れる（見直しトリガーに載せる）。

## Decision

**スキーマ変更は Prisma Migrate で行い、`prisma db push` は使わない。**

### ベースライン

現状のスキーマを `prisma/migrations/0_init/migration.sql` として書き出し、本番には「適用済み」として記録する。DB は**リセットしない**（[Baselining | Prisma Docs](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining) の手順）。

```bash
npx prisma migrate diff --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql
npx prisma migrate resolve --applied 0_init   # 本番に対して 1 回だけ
```

古い `20250910174318_init` は削除する。本番の `_prisma_migrations` にこの適用記録は無い（`prisma migrate status` が「未適用」と報告した）ため、後始末は要らない。

### 以後のスキーマ変更手順

`DATABASE_URL` が本番を向いている以上、**`prisma migrate dev` は使わない**。リセットを提案してくる可能性があるコマンドを本番に向けないため。代わりに次の 2 段で進める。

```bash
# 1. schema.prisma を編集したあと、DB との差分から SQL を作る（DB は変更しない）
pnpm db:diff > prisma/migrations/<連番>_<名前>/migration.sql

# 2. 本番に当てる（適用済みは飛ばされる）
pnpm db:deploy
```

`pnpm db:status` で適用状況を確認できる。`db:push` と `db:reset` は package.json に残すが、**本番を向いた状態では使わない**。

## 決定していないこと

- **`db:push` / `db:reset` スクリプトを削除するか。** 残してある。ローカル DB を立てて試作するときには依然として有用で、消すと選択肢ごと失う。本番を向いた `DATABASE_URL` で打たないことが前提。
- **`SHADOW_DATABASE_URL` の使いみち。** `schema.prisma` に宣言はあるが、`migrate dev` を使わない以上は出番が無い。宣言は消さずに残す。
- **CI でのマイグレーション適用。** 現状 Vercel のビルドでは `migrate deploy` を走らせていない（`postinstall` は `prisma generate` のみ）。手動で当てる運用のままにする。
- **マイグレーションの命名規則**。`0_init` 以降の連番の付け方は決めていない。

## Consequences

- `prisma/migrations/` が実態と一致し、「あるのに使われていない」状態が解消される。
- スキーマ変更が SQL として git に残るので、いつ何を変えたかを追える。ADR がスキーマ変更の**理由**を持ち、マイグレーションが**内容**を持つ形になる。
- `package.json` に `db:diff` / `db:deploy` / `db:status` を追加した。
- [docs/deployment.md](../deployment.md) の本番スキーマ更新手順を `db:push` から `migrate deploy` に差し替える。[docs/development-setup.md](../development-setup.md) と [docs/4-db-design/0-overview.md](../4-db-design/0-overview.md) の「開発は db push」という記述も改める。
- **移行の最後の 1 手（`migrate resolve --applied 0_init`）は本番 DB への書き込みであり、所有者が手で実行する。** これを忘れると `migrate deploy` が `0_init` を未適用とみなし、既存テーブルに対して `CREATE TABLE` を流そうとして失敗する。

### プレモーテム（この決定が誤っていた場合）

- `DATABASE_URL` が本番を向いたまま `pnpm db:migrate`（＝`migrate dev`）を打つと、本番のリセットを提案される。スクリプトを残したことが事故の入口になりうる。名前が `db:migrate` と穏当なのが、なお悪い。
- `migrate diff` で作った SQL は Prisma が自動生成したものをそのまま使うため、**中身を読まずにコミットしがち**になる。データを壊す変更（列の削除・型の縮小）でも警告なく生成される。
- ローカル DB を持たないため、マイグレーションを**本番に当てる前に試す場所が無い**。案D（ローカル復活）を退けた代償はここに出る。

## 見直しトリガー

- **ローカル MySQL を再び使うようになったとき** → 案D（`migrate dev` はローカル、`migrate deploy` は本番）へ移行を検討する。マイグレーションを本番前に試せるようになる
- **所有者以外が開発に加わったとき** → 手元から本番へ直接当てる運用が成立しなくなる。CI での `migrate deploy` を検討する
- **`pnpm db:migrate` を本番向きで打ってしまったとき**（または打ちかけたとき） → `db:migrate` / `db:push` / `db:reset` を package.json から外すか、本番向きでは落ちるガードを入れる
- **データを壊すマイグレーションを気づかず当ててしまったとき** → 生成 SQL のレビュー手順を決める
- Prisma のメジャーバージョンを上げるとき（`migrate diff` のフラグ名が変わることがある。6.10.0 は `--to-schema-datamodel`、ドキュメントの一部は `--to-schema` と書いている）

## 関連

- [ADR 0013 Vercel + TiDB へのデプロイ構成](0013-deploy-vercel-tidb.md)（本番 DB の位置づけ。スキーマ更新手順を本 ADR で差し替える）
- [ADR 0012 暦日キーを JST で固定する](0012-date-key-in-jst.md)（`@db.Date` 化が旧 init に記録されていなかった例）
- [ADR 0006 受取配当は受取通貨をレコード単位で持つ](0006-dividend-receipt-currency.md)（`currency` が旧 init に記録されていなかった例）
- [ADR 0015 受取配当は配当明細を写して保存し集計は手取り基準](0015-dividend-statement-fields-and-net-basis.md)（`db push` で当てた最後のスキーマ変更）
