# ADR 0001: Initial Technical Stack Decision

## Status

Accepted

## Context

We need to decide on the technical stack for the project.

## Decision

We will use:

- Next.js for frontend and backend
- Shadcn UI for components
- Tailwind CSS for styling
- MySQL for database
- Docker for containerization
- Prisma for ORM

## Consequences

This stack allows rapid development but requires familiarity with JavaScript/TypeScript.

## 検討した代替案

当初 ADR では代替案を記録していない（本 ADR は初期スタックの追認）。以降の ADR では選定時に代替案を並べて残す方針とする。

## 見直しトリガー

最終決定ではなく、条件付きの現時点最適とする。以下が起きたら本決定を見直す。

- このスタックで素直に満たせない要件が出たとき（例：MySQL で扱いづらい時系列・分析ワークロード、Next.js の App Router / SSR 前提と噛み合わない要求）
- 個人開発からチーム開発へ移り、JavaScript/TypeScript 習熟前提（Consequences 記載）がボトルネックになったとき
