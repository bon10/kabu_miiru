# 株式ポートフォリオ管理アプリ API 仕様書

このディレクトリには、株式ポートフォリオ管理アプリのAPI仕様書が含まれています。

## ファイル構成

- `api-spec.yaml` - OpenAPI 3.0.3形式の完全なAPI仕様書
- `README.md` - この説明ファイル

## API仕様書の利用方法

### 1. Swagger UIでの閲覧

Swagger UIを使用してAPI仕様書を可視化できます：

```bash
# Swagger UIをローカルで起動
npx swagger-ui-serve api-spec.yaml
```

または、オンラインのSwagger Editorを使用：
1. https://editor.swagger.io/ にアクセス
2. `api-spec.yaml` の内容をコピー&ペースト

### 2. コード生成

API仕様書から各言語のクライアントライブラリを生成：

```bash
# TypeScript/JavaScriptクライアント生成
npx @openapitools/openapi-generator-cli generate \
  -i api-spec.yaml \
  -g typescript-fetch \
  -o ./generated/client

# サーバーコード生成（Express.js）
npx @openapitools/openapi-generator-cli generate \
  -i api-spec.yaml \
  -g nodejs-express-server \
  -o ./generated/server
```

### 3. APIテスト

仕様書をPostmanやInsomniaにインポートしてAPIテストを実行：

```bash
# Postmanコレクション生成
npx openapi-to-postman -s api-spec.yaml -o portfolio-api.postman_collection.json
```

## API概要

### エンドポイント一覧

| カテゴリ | エンドポイント | 説明 |
|---------|---------------|------|
| **銘柄管理** | `GET /stocks` | 銘柄一覧取得 |
| | `POST /stocks` | 銘柄追加 |
| | `GET /stocks/{id}` | 銘柄詳細取得 |
| | `PUT /stocks/{id}` | 銘柄更新 |
| | `DELETE /stocks/{id}` | 銘柄削除 |
| **ポートフォリオ** | `GET /portfolio/composition` | 構成比率取得 |
| | `GET /portfolio/performance` | パフォーマンス比較 |
| **取引履歴** | `GET /transactions` | 取引履歴一覧 |
| | `POST /transactions` | 取引追加 |
| | `GET /transactions/summary` | 期間別サマリー |
| **価格管理** | `POST /prices/update` | 現在値更新 |
| | `GET /prices/history/{stockId}` | 価格履歴取得 |
| **サマリー** | `GET /summary` | 全体サマリー |
| | `GET /summary/by-company` | 証券会社別サマリー |
| **インポート** | `POST /import/tsv` | TSVファイルインポート |
| **バッチ** | `POST /batch/price-update` | 価格自動更新バッチ |

### 主要な機能

#### 1. 📋 銘柄一覧管理
- TSVファイルベースの銘柄データ管理
- 保有株数、損益、配当情報の追跡
- 証券会社別、市場別フィルタリング

#### 2. 📊 ポートフォリオ分析
- 銘柄別、証券会社別、市場別構成比率
- パフォーマンス比較とランキング
- 円グラフ、バーチャート対応

#### 3. 📝 取引履歴管理
- 売買・配当受取履歴の管理
- 期間別サマリーと分析
- ページネーション対応

#### 4. 💹 現在値取得
- 手動・自動価格更新機能
- 前場（11:30）・後場（15:00）の定期実行
- 価格履歴の保存とチャート表示

#### 5. 📊 合計情報表示
- ポートフォリオ全体のサマリー
- 証券会社別の集計情報
- リアルタイム損益計算

## 技術仕様

### データ形式
- **リクエスト/レスポンス**: JSON形式
- **日付**: ISO 8601形式 (`YYYY-MM-DD`)
- **日時**: ISO 8601形式 (`YYYY-MM-DDTHH:mm:ssZ`)
- **数値**: decimal形式（高精度計算対応）

### エラーハンドリング
すべてのエラーレスポンスは統一された形式：

```json
{
  "code": "ERROR_CODE",
  "message": "エラーメッセージ",
  "details": {},
  "timestamp": "2023-12-01T12:00:00Z"
}
```

### 認証
- **一般API**: 認証不要（単一ユーザー想定）
- **バッチAPI**: APIキー認証（`X-API-Key`ヘッダー）

## 開発環境での利用

```bash
# 開発サーバー起動
cd stock-portfolio-app
pnpm dev

# API仕様書の確認
curl http://localhost:3300/api/stocks

# テストデータインポート
curl -X POST http://localhost:3300/api/import/tsv \
  -F "file=@sample-data.tsv" \
  -F "options={\"replaceExisting\":false}"
```

## 関連リンク

- [要件定義書](https://www.notion.so/yosoi/2160e811f99681f7b49dffc15db79cfe)
- [設計書](https://www.notion.so/yosoi/2170e811f9968026bdd3edaa5b70951d)
- [プロジェクトリポジトリ](../README.md)