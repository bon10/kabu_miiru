# Docker Setup Instructions

## 前提条件
- Docker
- Docker Compose

## セットアップ手順

### 1. 環境変数の設定
```bash
cp .env.example .env
```

`.env`ファイルを編集して、必要な環境変数を設定してください。

### 2. Dockerコンテナの起動
```bash
# MySQLとアプリケーションコンテナを起動
docker-compose up -d

# ログを確認
docker-compose logs -f
```

### 3. データベースマイグレーション
```bash
# アプリケーションコンテナ内でマイグレーションを実行
docker-compose exec app npm run db:migrate

# または、Prisma Pushを使用（開発環境）
docker-compose exec app npm run db:push
```

### 4. アプリケーションへのアクセス
http://localhost:3000 でアプリケーションにアクセスできます。

## 開発用コマンド

### データベース関連
```bash
# Prisma Studio（データベースGUI）
docker-compose exec app npm run db:studio

# マイグレーションファイルの生成
docker-compose exec app npm run db:migrate

# Prismaクライアントの再生成
docker-compose exec app npm run db:generate

# データベースのリセット
docker-compose exec app npm run db:reset
```

### コンテナ管理
```bash
# コンテナの停止
docker-compose down

# コンテナの停止とボリュームの削除（データベースデータも削除）
docker-compose down -v

# コンテナの再ビルド
docker-compose build --no-cache

# ログの確認
docker-compose logs app
docker-compose logs mysql
```

## トラブルシューティング

### MySQLに接続できない場合
1. MySQLコンテナが起動しているか確認
   ```bash
   docker-compose ps
   ```

2. データベース接続情報が正しいか確認
   ```bash
   docker-compose exec mysql mysql -u stock_user -p stock_portfolio
   ```

### アプリケーションが起動しない場合
1. ログを確認
   ```bash
   docker-compose logs app
   ```

2. 依存関係を再インストール
   ```bash
   docker-compose exec app npm install
   ```

### Prismaマイグレーションでエラーが発生する場合
1. Prismaクライアントを再生成
   ```bash
   docker-compose exec app npm run db:generate
   ```

2. データベーススキーマをプッシュ（開発環境のみ）
   ```bash
   docker-compose exec app npm run db:push
   ```
