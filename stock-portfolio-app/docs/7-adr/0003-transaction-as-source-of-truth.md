# ADR 0003: 保有株数・投資額は Transaction を Source of Truth とする

## Status

Accepted (2026-06-12)

## Context

保有株数（`holdingShares`）・投資額（`totalInvestment`）等の数値を `Stock` テーブルに直接保持する設計と、`Transaction` 履歴を集約して算出する設計のどちらを採用するかを決める必要があった。

現状のスキーマでは `Stock` に直接フィールドが存在しており、売買のたびに `Stock` の値を手動で更新する運用になっていた。これは整合性リスクが高く、過去日付の取引追加や削除に対応できない。

## Decision

保有株数・投資額の **Source of Truth は `Transaction` テーブル** とする。`Stock` 側のフィールドは Read Model（キャッシュ）の位置づけとし、Transaction の追加・更新・削除をトリガーに自動再計算する。

### 理由

- 保有株数は本質的に「過去の売買取引の集約結果」であり、Transaction が事実、Stock の値はその射影
- 売買のたびに `Stock` を手で更新する運用は更新漏れで残高がズレる整合性リスクを持つ
- 過去日付に遡って取引を追加・削除しても、自動で残高が正しく再計算される
- TSV インポート時も、Transaction を生成すれば Stock の集計値は派生する

## Consequences

- **書き込み**：Transaction の追加・更新・削除時に、対象 `Stock` の集計値（保有株数・投資額・実現損益等）を再計算するロジックを集約する
- **TSV インポート**：保有情報を直接 Stock に書くのではなく、初期保有を表す Transaction を生成するか、明示的に「初期残高 Transaction」種別を導入する
- **読み取り**：通常の画面表示は Stock のキャッシュ値を参照し、整合性が疑わしい場合は Transaction から再集計するメンテナンスコマンドを用意する
- **売却フロー**：SELL Transaction を作成すれば、Stock の保有株数・実現損益が自動で更新される
- **スキーマ**：`Stock` 側のフィールドは残すが、ドキュメント上で「派生値（cached）」と明示する

## 決定していないこと

- ~~TSV インポート由来の保有（初期残高）を「初期残高 Transaction」種別で表すか、インポート時に BUY Transaction を生成するかは未決定~~
  → **[ADR 0007](0007-initial-balance-transaction.md) で決定済み（2026-08-14）**。`TransactionType` は増やさず `Transaction.isInitialBalance` フラグで識別し、集計上は BUY と同一に扱う

## 見直しトリガー

- ~~**Transaction を持たない保有が集計の前提を崩していることが確認されたとき**~~
  → **発火済み（2026-08-14）**。保有 55 銘柄に対し Transaction は 3 件、購入日を持つのは 7 件のみで、48 銘柄が推移グラフに載らないという実害が確認された。[ADR 0007](0007-initial-balance-transaction.md) で初期残高 Transaction を導入し、本決定の不変条件を回復させる
- Transaction からの再集計コストが、通常画面の表示 UX を損なう規模になったとき
- **初期残高 Transaction の導入後も、Transaction を持たない保有が新たに発生したとき**（TSV インポート経路の修正漏れ等）

## 関連

- [ADR 0005 米国株の円換算](0005-us-stock-jpy-conversion.md)（Transaction を持たない保有の実例）
- [ADR 0007 移行データの保有は初期残高 Transaction で表す](0007-initial-balance-transaction.md)（本 ADR の見直しトリガー発火を受けた決定）
- [ADR 0008 ポートフォリオ推移は日次終値から再構成](0008-portfolio-timeline-from-daily-close.md)（本 ADR の「読み取り時に再構成する」考え方を時系列へ適用）
