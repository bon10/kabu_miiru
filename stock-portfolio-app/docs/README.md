# 株式ポートフォリオ管理アプリ - ドキュメント

このディレクトリには、株式ポートフォリオ管理アプリ（通称「株みーる」）の包括的なドキュメントが含まれています。

## 📁 ドキュメント構成

### [0-overview/](./0-overview/)

プロジェクトの全体概要と基本情報

- **[project-overview.md](./0-overview/project-overview.md)** - プロジェクトの目的、特徴、実装状況

### [1-requirements/](./1-requirements/)

機能要件の詳細定義

- **[0-overview.md](./1-requirements/0-overview.md)** - 要件概要と開発優先度
- **[stock-management.md](./1-requirements/stock-management.md)** - 銘柄一覧機能要件
- **[portfolio-summary.md](./1-requirements/portfolio-summary.md)** - ポートフォリオサマリー機能要件
- **[portfolio-visualization.md](./1-requirements/portfolio-visualization.md)** - 視覚化分析機能要件
- **[transaction-management.md](./1-requirements/transaction-management.md)** - 取引履歴管理機能要件
- **[price-update.md](./1-requirements/price-update.md)** - 株価自動取得機能要件

### [2-domain/](./2-domain/)

ドメインモデルとビジネスルール

- **[0-overview.md](./2-domain/0-overview.md)** - ドメインモデル概要
- **[business-rules.md](./2-domain/business-rules.md)** - ビジネスルールと計算仕様

### [3-architecture/](./3-architecture/)

システムアーキテクチャ設計

- **[0-overview.md](./3-architecture/0-overview.md)** - アーキテクチャ概要
- **[tech-stack.md](./3-architecture/tech-stack.md)** - 技術スタック詳細
- **[data-flow.md](./3-architecture/data-flow.md)** - データフロー設計

### [4-db-design/](./4-db-design/)

データベース設計

- **[0-overview.md](./4-db-design/0-overview.md)** - データベース設計概要

### [5-ui-design/](./5-ui-design/)

ユーザーインターフェース設計（未実装）

### [6-api-spec/](./6-api-spec/)

API仕様書

- **[api-spec.yaml](./6-api-spec/api-spec.yaml)** - OpenAPI 3.0.3形式の完全なAPI仕様書

### [7-adr/](./7-adr/)

アーキテクチャ決定記録（ADR）。「最終決定は存在しない」前提で、見直しトリガー付きで設計判断を残す。現行 ADR 0001〜0013（配当の分離・保有株数の Source of Truth・配当の期間集計・米国株の円換算・受取配当の通貨・受取配当額の算出方法・初期残高 Transaction・推移の日次終値からの再構成・平均取得単価の丸め・単一ユーザーの Google ログイン・暦日キーの JST 固定・Vercel + TiDB へのデプロイ構成）。

## 🚀 クイックスタート

### 1. プロジェクト概要の理解

まず[プロジェクト概要](./0-overview/project-overview.md)を読んで、アプリの目的と特徴を理解してください。

### 2. 機能要件の確認

[機能要件概要](./1-requirements/0-overview.md)で主要機能と開発優先度を確認してください。

### 3. 技術スタックの理解

[技術スタック](./3-architecture/tech-stack.md)で使用技術と選定理由を確認してください。

### 4. データベース設計の確認

[データベース設計](./4-db-design/0-overview.md)でデータ構造を理解してください。

### 5. API仕様の確認

[API仕様書](./6-api-spec/api-spec.yaml)で具体的なエンドポイントを確認してください。

## 📊 TSVデータ仕様

### ファイル形式

- **ファイル名**: `stock_template.tsv`
- **文字エンコーディング**: UTF-8
- **列数**: 20列
- **区切り文字**: タブ文字

### 主要な列

1. **No** - 連番
2. **銘柄名** - 株式の正式名称
3. **保有会社** - 証券会社名
4. **市場** - 国内/米国
5. **コード** - 銘柄コード
6. **保有株数** - 現在の保有株数
7. **平均取得単価** - 平均購入価格
8. **投資額** - 総投資金額
9. **現在価格** - 最新株価
10. **損益** - 未実現損益

詳細は[プロジェクト概要](./0-overview/project-overview.md#-tsvデータ仕様)を参照してください。

## 🔧 開発環境セットアップ

```bash
# プロジェクトのクローン
git clone <repository-url>
cd stock-portfolio-app

# 依存関係のインストール
pnpm install

# データベースのセットアップ
pnpm db:push

# 開発サーバーの起動
pnpm dev
```

## 📈 現在の実装状況

### ✅ 実装済み

- 基本的なCRUD操作
- TSVデータインポート機能
- Yahoo Finance API連携（基本機能）
- データベーススキーマ設計
- フロントエンド基盤

### 🚧 未実装

- 取引履歴管理機能
- 視覚化分析機能
- 自動価格更新バッチ
- 認証・認可機能
- 本番環境デプロイ

## 🔗 関連リンク

- **[開発環境セットアップ](./development-setup.md)** - 詳細なセットアップ手順
- **[デプロイ手順](./deployment.md)** - Vercel + TiDB Cloud への公開手順と cron 設定
- **[外部API連携仕様](./external-apis.md)** - Yahoo Finance API等の詳細
- **[開発・運用手順](../CLAUDE.md)** - 詳細な開発コマンド
- **[実装ファイル](../prisma/schema.prisma)** - 実際のデータベーススキーマ

## 📝 ドキュメント更新履歴

- **2025-01-22**: 初版作成、TSVデータ仕様追加、実装状況更新
- **2025-01-22**: Yahoo Finance API詳細追加、認証状況明確化
