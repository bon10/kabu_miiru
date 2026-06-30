# ADR 0002: 配当を売買取引から分離した独立エンティティとする

## Status

Accepted (2026-06-12)

## Context

配当（DIVIDEND）の記録方法として、当初スキーマには 2 つのモデルが併存していた：

- `Transaction.transactionType = DIVIDEND`（売買取引と同一テーブルで扱う）
- `DividendHistory`（配当専用テーブル）

どちらかに一本化する必要があり、ドメインモデルとして配当を売買取引と「同質のもの」として扱うか、「別概念」として扱うかを決める必要があった。

## Decision

配当は `DividendHistory` テーブルにのみ記録する。`Transaction` から `DIVIDEND` 種別は削除し、`Transaction` は売買（BUY / SELL）のみを表すエンティティに限定する。

### 理由

- 売買は投資家が能動的に起こすイベント、配当は会社から受動的に受け取るイベントであり、ライフサイクルが異なる
- 配当固有の属性が存在する：
  - 権利確定日
  - 期末配当 / 中間配当 / 特別配当の区分
  - 1 株あたり配当金（DPS）
- これらを `Transaction` に持たせると、売買レコードで NULL カラムが多発する
- 売買は保有株数を増減させるが、配当は保有株数に影響しないため、不変条件も異なる

## Consequences

- スキーマ：`Transaction.transactionType` から `DIVIDEND` を削除し、BUY / SELL のみとする
- 既存データ：`Transaction(DIVIDEND)` のレコードが存在する場合は `DividendHistory` への移行が必要
- UI：「キャッシュフロー一覧」のように売買と配当を時系列でまとめて表示したい場合は、ビュー層で UNION する
- 集計：年次・半期の配当合計は `DividendHistory` 単独で算出可能
