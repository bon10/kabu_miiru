# ドメインモデル - 概要

## 参照元要件
このドキュメントは以下の機能要件に基づいて設計されています：
- [機能要件概要](../1-requirements/overview.md)
- [銘柄一覧機能要件](../1-requirements/stock-management.md)
- [取引履歴管理機能要件](../1-requirements/transaction-management.md)

## ドメインの責務

### 株式投資ドメイン
個人の株式投資管理に関する中核的なビジネスロジックとデータ構造を定義する。

### 主要エンティティ
1. **[株式（Stock）](./stock-entity.md)** - 銘柄情報の中核エンティティ
2. **[取引（Transaction）](./transaction-entity.md)** - 売買・配当取引の記録
3. **[価格履歴（PriceHistory）](./price-history-entity.md)** - 株価の時系列データ
4. **[配当履歴（DividendHistory）](./dividend-history-entity.md)** - 配当支払い履歴
5. **[ポートフォリオサマリー（PortfolioSummary）](./portfolio-summary-entity.md)** - 集計データ

## データソース

### TSVファイル仕様
- **提供形式**: 20列のTSVファイル
- **文字エンコーディング**: UTF-8
- **データ精度**: 金額・株数は小数点対応
- **マッピング**: TSV列とエンティティフィールドの1:1対応

### 外部データ連携
- **株価API**: Yahoo Finance（メイン）
- **補完データ**: 楽天RSS（将来）
- **手動入力**: API取得失敗時の代替手段

## ドメインルール

### [ビジネスルール](./business-rules.md)
- 株価計算ロジック
- 保有株数整合性
- 損益計算仕様

### [データ整合性規則](./data-integrity.md)
- 取引履歴との整合性
- マスターデータの一意性
- 参照整合性制約

## 関連ドキュメント
- [データベース設計](../4-db-design/database-schema.md) - 物理設計への落とし込み
- [API仕様](../6-api-spec/api-spec.yaml) - ドメインオブジェクトのAPI表現