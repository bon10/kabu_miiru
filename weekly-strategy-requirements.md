# 週次投資戦略 自動提案機能 要件定義書

## 1. 背景と目的

既存の `stock-portfolio-app`（Next.js + Prisma + MySQL）で管理しているポートフォリオに対し、論文「大規模言語モデルを用いた株式投資戦略の自動生成におけるフィードバック設計」(SIG-FIN-036-31, 河村ほか) の知見を取り入れ、**LLMが毎週バックテスト結果をフィードバックとして受け取り、投資戦略を反復的に改善・提案する仕組み** を構築する。

論文の主な示唆：

- 戦略改善の成否は「フィードバック設計」より「**モデル選択**」の影響が大きい。Claude系（特にSonnet/Opus）は既存ロジックを保持しつつ局所改善する傾向で安定した改善が得られやすい。
- フィードバックに含める情報の **範囲** （基本指標のみ vs. 基本＋追加指標）と **形式** （テキストのみ vs. テキスト＋プロット画像）は、提案される手法の "質" を変える。
  - 追加情報（IC/ICIR、ネットエクスポージャー、ファクターエクスポージャー）→ 中立化系の実装が増える
  - 時系列プロット画像 → IC/VIX等を用いたレジーム適応の実装が増える
- 反復ループは「初期戦略 → バックテスト → フィードバック生成 → コード/パラメータ修正 → 再バックテスト」を、エラー解消＋APPROVED条件で打ち切る形が有効。

## 2. スコープ

対象は `stock-portfolio-app` に登録された日本株（4桁数字 + ".T"）および米国株のポートフォリオ。週次（例：毎週月曜の市場前）に自動実行され、ユーザーに「今週の戦略アップデート提案」をWeb UI上で提示する。最終的な売買執行は人間判断とし、本機能は **提案までを担う Decision Support** とする。

## 3. ユーザーストーリー

- 投資家として、毎週月曜朝に「先週までの戦略パフォーマンス分析と、今週の改善提案」をダッシュボードで確認したい。
- 提案を採用 / 却下 / 一部採用でき、採用したものは次回イテレーションの "現行戦略" として履歴管理されてほしい。
- 各提案がどのモデル・どのフィードバック条件 (P1/P2/P3) で生成されたか、根拠指標とともに確認したい。
- 戦略のバージョン履歴と、各バージョンの累積リターン・ドローダウン推移を比較できるようにしたい。

## 4. 機能要件

### 4.1 戦略管理

- `Strategy` エンティティ：戦略名、説明、Pythonコード（または宣言的ルールDSL）、対象ユニバース、パラメータ、作成日時、親バージョンID。
- `StrategyVersion` を時系列に保存（論文の「総バージョン数」に相当）。
- 各バージョンに `change_type`（substantive / moderate / superficial）をLLM自己評価で付与し「実質的変更率」を算出。

### 4.2 データ取得とバックテスト

- 既存の `main.py` / Next.js の価格取得APIを拡張し、yfinance + 補助データ（出来高、ファンダ、為替、VIX等）を日次で蓄積。
- バックテストエンジン（Pythonサービスを別コンテナ化、FastAPIで Next.js から呼び出し）で以下を計算：
  - **基本指標（P1相当）**：年率リターン、年率ボラティリティ、シャープレシオ、最大ドローダウン、トータルコスト、特徴量統計（count/mean/std/min/1/5/50/95/99/max/skew/kurtosis/missing/zero）
  - **追加指標（P2相当）**：日次ICの平均・標準偏差・ICIR、ネットエクスポージャー期間平均、ファクターエクスポージャー（サイズ、バリュー、モメンタム、ボラ、クオリティ等の主要スタイルファクター）
  - **可視化（P3相当）**：累積リターン（コスト込/抜き）、ドローダウン、ネットエクスポージャー、累積IC、累積ファクターエクスポージャーをPNG出力

### 4.3 LLMフィードバックループ（週次バッチ）

論文 Section 3 を踏襲した状態機械として実装：

1. `INIT`：現行戦略コードとチャット履歴をロード
2. `BACKTEST`：直近データで実行
3. `FEEDBACK_GENERATION`：選択されたプロンプト（P1/P2/P3）でLLMにメトリクスと画像を渡し、改善提案を生成
4. `CODE_REVISION`：提案に従いコードを書き換え
5. `EXECUTION`：エラー時は最大Nリトライ（論文同様 10分タイムアウト）
6. `EVALUATION`：年率改善幅・実質的変更率を計算
7. 終了条件：成功実行 10回到達 / LLMが `APPROVED` を出力 / 改善幅が閾値以下

デフォルトのフィードバック条件は **P3（基本＋追加情報＋プロット）** とし、ユーザーが切り替え可能。

### 4.4 モデル選択

論文結果より、デフォルトは **Claude Sonnet 4.5**（平均改善幅最大）、選択肢として Claude Opus 4.5 / Claude Haiku 4.5 / Gemini 3 Pro / GPT-5 を提供。

- 「保守的に局所改善」 → Claude / GPT-5 mini
- 「大胆に新戦略を探索」 → Gemini 3 系（分散が大きい点を UI で警告）
- 各モデルの過去改善実績（年率改善幅・実質的変更率）をリーダーボード表示

### 4.5 提案の提示と承認

- ダッシュボード上に「今週の提案カード」を表示：要約、改善ポイント、期待される変化、根拠メトリクス、Before/After バックテストグラフ
- ユーザーアクション：採用 / 却下 / コメント付き差し戻し（→ そのコメントを次回ループのフィードバックに追加）
- 採用された戦略は翌週の "現行戦略" として固定

### 4.6 スケジューリング

- 毎週月曜 06:00 JST に Cron（または cowork の `schedule` skill / Vercel Cron / Node.js cron）で起動
- 手動トリガーボタンも提供

### 4.7 監査・履歴

- 全LLMやり取り（プロンプト・レスポンス・トークン数・コスト）を保存
- 戦略改善履歴のタイムライン UI

## 5. 非機能要件

- **再現性**：temperature をデフォルト 0.2 に設定（論文では 1.0 で分散が大きかったため低めに）。シード・モデルバージョン・データスナップショットを記録。
- **コスト管理**：1週次ループあたりのトークン上限・USD上限を設定。超過時は中断。
- **安全性**：自動執行は行わない。生成コードはサンドボックス（Docker、ネットワーク無効）で実行。
- **観測性**：Prisma に `BacktestRun` `LLMInteraction` `StrategyProposal` テーブルを追加し、ログを構造化。

## 6. データモデル拡張案（Prisma）

```prisma
model Strategy {
  id          String   @id @default(cuid())
  name        String
  description String?
  versions    StrategyVersion[]
  createdAt   DateTime @default(now())
}

model StrategyVersion {
  id           String   @id @default(cuid())
  strategyId   String
  parentId     String?
  code         String   @db.LongText
  changeType   String   // substantive | moderate | superficial
  approved     Boolean  @default(false)
  backtests    BacktestRun[]
  llmRuns      LLMInteraction[]
  createdAt    DateTime @default(now())
}

model BacktestRun {
  id            String   @id @default(cuid())
  versionId     String
  startDate     DateTime
  endDate       DateTime
  metrics       Json     // returns, vol, sharpe, maxDD, IC, ICIR, exposures
  plotsPath     String?
  createdAt     DateTime @default(now())
}

model LLMInteraction {
  id          String   @id @default(cuid())
  versionId   String
  model       String
  promptType  String   // P1 | P2 | P3
  prompt      String   @db.LongText
  response    String   @db.LongText
  tokensIn    Int
  tokensOut   Int
  costUsd     Float
  createdAt   DateTime @default(now())
}

model StrategyProposal {
  id          String   @id @default(cuid())
  versionId   String
  weekOf      DateTime
  status      String   // pending | accepted | rejected
  userComment String?
  createdAt   DateTime @default(now())
}
```

## 7. 評価指標（論文準拠）

- **年率改善幅 (%)**：`new_annualized_return - prev_annualized_return`
- **実質的変更率**：`(substantive + 0.5 * moderate) / total_versions`
- **APPROVED率**：実運用基準を満たしたと判断された割合
- 週次ダッシュボードで上記を可視化し、モデル / プロンプト条件のチューニングに利用。

## 8. フェーズ計画（提案）

1. **Phase 1 — 基盤**：バックテストエンジンの分離、基本指標 (P1) の算出、Prisma 拡張
2. **Phase 2 — フィードバックループ**：LLM API 連携（Claude Sonnet 4.5 から）、P1 プロンプト、コード生成・実行サンドボックス
3. **Phase 3 — 追加情報 (P2)**：IC/ICIR、ファクターエクスポージャー計算
4. **Phase 4 — マルチモーダル (P3)**：プロット生成と画像入力対応
5. **Phase 5 — UI**：週次提案ダッシュボード、承認フロー、履歴比較
6. **Phase 6 — スケジューリング & 監査**：Cron、コスト/安全ガード、A/Bモデル比較

## 9. オープン課題

- 銘柄ユニバース：現状のポートフォリオ銘柄のみか、TOPIX500等の広いユニバースを別途管理するか
- ファクターモデルのデータソース（Barra相当が無い場合、PCAやFama-French簡易版で代替するか）
- 生成コードの実行を Next.js 側のNodeから行うか、専用Pythonワーカー（推奨）にするか
- LLMコスト上限と、温度・反復回数のデフォルト値
- 売買執行APIへの接続を将来的に行うか（現状はDecision Supportに限定）

---

要件はここまでです。次のステップとして、Phase 1 のバックテストエンジン分離から着手するか、まずデータモデル(Prisma migration)から始めるか、ご希望を教えてください。
