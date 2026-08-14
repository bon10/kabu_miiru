---
name: tdd
description: テスト駆動開発（TDD）で実装を進める。まず失敗するテストを書き（red）、最小実装で通し（green）、重複を整理する（refactor）。「TDDで」「テストから書いて」「テストファースト」等のフレーズや、新しい計算・バリデーション・ドメインロジックを追加/変更するときに起動。検証ループは Vitest（`pnpm test` / `pnpm test:watch`）。
---

# TDD (Red-Green-Refactor)

## Overview

新しいドメインロジック・計算・バリデーションを追加/変更するときは、実装より先にテストを書いて回す。
検証ループは Vitest。純粋関数に寄せてテストし、UI/DB からはその関数を呼ぶだけにする。

## 前提（このリポジトリ）

- テストランナー: **Vitest**（`stock-portfolio-app`）。設定: [vitest.config.mts](../../../stock-portfolio-app/vitest.config.mts)（node 環境・`@/` エイリアス）。
- コマンド: `pnpm test`（1 回実行） / `pnpm test:watch`（変更監視でループ）。
- テストファイルは対象の隣に `*.test.ts`（例: `src/lib/dividend.ts` ↔ `src/lib/dividend.test.ts`）。
- テストしやすいよう、**計算・判定は `src/lib` の純粋関数へ抽出**する。API ルートや React フォームに計算を直接書かない（例: [src/lib/dividend.ts](../../../stock-portfolio-app/src/lib/dividend.ts) を API とフォームで共用）。

## Workflow

### 1. Red — 失敗するテストを先に書く

- 変えたい振る舞いを説明する最小のテストを `*.test.ts` に書く。
- `cd stock-portfolio-app && pnpm test` を実行し、**意図どおり失敗する**ことを確認する（未実装、または期待値の不一致）。
- 最初から通ってしまうなら、その振る舞いはまだ固定できていない。ケースを見直す。

### 2. Green — 最小実装で通す

- テストを通すためだけの最小限の実装を書く。
- `pnpm test` で green を確認する。

### 3. Refactor — 重複・可読性を整える

- 同じ計算が複数箇所（API とフォーム等）にあれば `src/lib` のヘルパーへ集約し、呼び出し側を差し替える。
- `pnpm test` / `pnpm lint` / `npx tsc --noEmit` を通す。

### 4. 反復

- 追加の振る舞いごとに 1→3 を繰り返す。
- 連続で回すときは別ターミナルで `pnpm test:watch`（保存のたびに自動再実行）。

## 注意

- **通貨・金額の計算は浮動小数点誤差に注意**（例: `2.3 × 50 = 114.9999…`）。格納精度（`Decimal(15,2)`）に丸めるなどの方針をテストで固定する。
- 設計判断（スキーマ・集計・換算・命名の決定）が絡むときは `adr-check` を併走させる。
- コミット時は `simple-commit` が lint / typecheck / test を実行する。
