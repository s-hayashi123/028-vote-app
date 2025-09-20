# 【Next.js 15 + React 19 + Cloudflare】useOptimistic で作るリアルタイム投票アプリ（改訂版 v2）

> このリポジトリ（Next 15 / React 19 / Tailwind CSS v4 / OpenNext Cloudflare）前提で、最新の公式ドキュメントに沿ったベストプラクティスで書き直したチュートリアルです。
>
> 参考: Next.js（App Router・Server Actions・キャッシュ再検証）[公式](https://nextjs.org/docs), React 19（useOptimistic / useActionState）[公式](https://react.dev), Cloudflare D1 [公式](https://developers.cloudflare.com/d1/), Drizzle ORM [公式](https://orm.drizzle.team/), shadcn/ui [公式](https://ui.shadcn.com/), Recharts [公式](https://recharts.org/)

---

## 何を作るか（Outcome）

- シンプルな投票アプリ。
- クリック直後に UI を+1 更新（React 19 `useOptimistic`）。
- バックエンドは Server Actions で処理し、`revalidatePath`で即時反映。
- 結果を Recharts で可視化（SSR 配慮: `ResponsiveContainer`の`initialDimension`）。

## 学ぶこと（Skills）

- **Server Actions**と**キャッシュ再検証（`revalidatePath`）**の基本。
- **React 19 `useOptimistic`**での楽観的 UI パターン。
- **Cloudflare D1 向け Drizzle 構成**（`drizzle-orm/d1` + Workers バインディング）。
- **Tailwind v4 + shadcn/ui**のモダン UI 構成（レスポンシブ対応）[[memory:2955648]][[memory:2955168]].

---

## このリポの前提（現状）

- Framework: Next.js 15（App Router）
- React: 19
- CSS: Tailwind v4（`src/app/globals.css`で`@import "tailwindcss";`）
- Runtime/Deploy: OpenNext + Cloudflare Workers（`wrangler.jsonc`）

> セットアップは完了済み。以降は機能追加と学習に集中します。

---

## 推奨アーキテクチャ（Cloudflare D1 前提）

- フロント: Server Components（データ取得）＋ Client Components（操作、`useOptimistic`）。
- ミューテーション: Server Action（`'use server'`）。
- 再検証: **`revalidatePath('/poll/[id]')`**で詳細ページを即時更新。
- DB: **Cloudflare D1**（Workers にネイティブ統合。ネットワーク遅延と運用コストが小さい）。
- Drizzle は **Cloudflare D1 ドライバ**（`drizzle-orm/d1`）を使用し、**Workers の D1 バインディング**をそのまま渡します。

---

## 依存関係（未導入なら）

```bash
# グラフ
npm install recharts

# UI コンポーネント（必要に応じて）
npx shadcn@latest add button card

# Drizzle（D1 用）
npm install drizzle-orm
# 開発ツール（マイグレーション生成）
npm install -D drizzle-kit
# 型補完（任意）
npm install -D @cloudflare/workers-types
```

---

## D1 の準備（wrangler）

1. D1 データベースを作成

```bash
npx wrangler d1 create 028-vote-db
```

2. `wrangler.jsonc` にバインディングを追加（例）

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "028-vote-app",
  "main": ".open-next/worker.js",
  "compatibility_date": "2025-03-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "binding": "ASSETS", "directory": ".open-next/assets" },
  "observability": { "enabled": true },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "028-vote-db",
      "database_id": "<D1_DATABASE_ID>",
      "migrations_dir": "drizzle"
    }
  ]
}
```

> 既存の `wrangler.jsonc` に `d1_databases` ブロックを追記してください。

3. DB ID を確認（必要に応じて）

```bash
# CLI で確認
npx wrangler d1 list | cat

# もしくは Cloudflare ダッシュボード → Workers & D1 → Databases
```

---

## ディレクトリ構成とファイル作成

```text
028-vote-app
├─ src/
│  ├─ db/
│  │  ├─ client.ts          # Drizzleクライアント（D1バインディング）
│  │  └─ schema.ts          # Drizzleスキーマ（SQLite）
│  └─ app/...
├─ d1/
│  └─ seed.sql               # 任意のシードデータ
├─ drizzle/
│  └─ <timestamp>_.../migration.sql  # drizzle-kit が生成
├─ wrangler.jsonc
└─ cloudflare-env.d.ts       # wrangler typesで更新（型）
```

作成コマンド例:

```bash
mkdir -p src/db d1 drizzle
```

---

## データモデル（Drizzle → SQLite/D1）

```ts
// src/db/schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const poll = sqliteTable("Poll", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
});

export const pollOption = sqliteTable("PollOption", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  votes: integer("votes").notNull().default(0),
  pollId: text("pollId").notNull(),
});
```

### Drizzle クライアント（`getDb`）

```ts
// src/db/client.ts
import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB);
}
```

### マイグレーション（drizzle-kit）

```bash
# 必要なら追加インストール
npm install -D drizzle-kit dotenv

# 環境変数を設定（ターミナルの例）
export CLOUDFLARE_ACCOUNT_ID=<your_account_id>
export CLOUDFLARE_DATABASE_ID=<your_d1_database_id>
export CLOUDFLARE_D1_TOKEN=<your_api_token>

# スキーマ差分からSQLを生成
npx drizzle-kit generate

# 生成されたSQLを適用（wrangler経由でもOK）
npx wrangler d1 migrations apply 028-vote-db --local || true
npx wrangler d1 migrations apply 028-vote-db --remote || true

# 直接SQLを適用したい場合（任意）
npx wrangler d1 execute 028-vote-db --local --file=./drizzle/*/migration.sql
```

差分が出たとき（スキーマ変更時）は、`--from-empty`の代わりに既存 SQL を基準にした手動メンテ/追記、または新しい SQL ファイルに分けて適用してください。

---

## OpenNext + Cloudflare 開発メモ

- `next dev` 時に OpenNext で `getCloudflareContext()` を利用できるように、`next.config.ts` に初期化コードが入っています（既に設定済み）。
- 型を更新する場合:

```bash
npm run cf-typegen
```

これにより `cloudflare-env.d.ts` が更新され、`DB` バインディングの型補完が効きます。

---

## 動作検証用の SQL（任意）

```bash
# 現在のPollを確認（ローカル）
npx wrangler d1 execute 028-vote-db --local --command "SELECT * FROM Poll;"

# 選択肢と票数を確認
npx wrangler d1 execute 028-vote-db --local --command "SELECT text, votes FROM PollOption WHERE pollId='poll1' ORDER BY id;"
```

---

## シード（任意: SQL で投入）

```sql
-- d1/seed.sql
INSERT INTO Poll (id, title) VALUES ("poll1", "好きなフロントエンドフレームワークは？");
INSERT INTO PollOption (id, text, votes, pollId) VALUES
("opt1", "React", 0, "poll1"),
("opt2", "Vue", 0, "poll1"),
("opt3", "Svelte", 0, "poll1"),
("opt4", "SolidJS", 0, "poll1");
```

```bash
npx wrangler d1 execute 028-vote-db --local --file=./d1/seed.sql
```

> ポイント: D1 は URL ではなく **Workers のバインディング**経由で接続します。Drizzle の D1 ドライバ（`drizzle-orm/d1`）に **`env.DB`** を渡します。

---

## Server Action（投票 + 再検証 / Drizzle）

```ts
// src/app/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { pollOption } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function submitVote(optionId: string, pollId: string) {
  const db = getDb();
  await db
    .update(pollOption)
    .set({ votes: sql`${pollOption.votes} + 1` })
    .where(eq(pollOption.id, optionId));
  revalidatePath(`/poll/${pollId}`);
}
```

- 解説
  - `getCloudflareContext()` で **現在のリクエストの `env`** を取得（OpenNext Cloudflare）。
  - `import { drizzle } from "drizzle-orm/d1"` を使い、`drizzle(env.DB)` で **D1 に直結**。
  - ミューテーション後は **`revalidatePath`** で SSG キャッシュを即時無効化。

---

## ページ（サーバーで取得 → クライアントへ / Drizzle）

```ts
// src/app/poll/[id]/page.tsx
import { getDb } from "@/db/client";
import { poll, pollOption } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { VotingUI } from "@/components/voting-ui";

export default async function PollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const [p] = await db.select().from(poll).where(eq(poll.id, id)).limit(1);
  if (!p) notFound();
  const options = await db
    .select()
    .from(pollOption)
    .where(eq(pollOption.pollId, id))
    .orderBy(asc(pollOption.id));
  const data = { ...p, options } as any;
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 text-center">{data.title}</h1>
      <VotingUI poll={data} />
    </div>
  );
}
```

> メモ: Cloudflare 実行環境では Node の一部 API が未実装です。`wrangler.jsonc` に `nodejs_compat` を設定済みであれば、上記構成（`drizzle-orm/d1` + `env.DB`）で問題ありません。

---

## クライアント UI（React 19 `useOptimistic` + Recharts）

- クリック即時で UI を+1、裏で Server Action。
- Recharts は SSR 時に初期寸法が無いとレイアウトシフトが起きやすいので、`initialDimension` を指定。

```tsx
// src/components/voting-ui.tsx
"use client";

import { useOptimistic, useEffect, useState, startTransition } from "react";
import { submitVote } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type PollWithOptions = {
  id: string;
  title: string;
  options: { id: string; text: string; votes: number; pollId: string }[];
};

export function VotingUI({ poll }: { poll: PollWithOptions }) {
  const [voted, setVoted] = useState(false);
  const [optimisticPoll, addOptimisticVote] = useOptimistic(
    poll,
    (state, updatedOptionId: string) => {
      const options = state.options.map((o) =>
        o.id === updatedOptionId ? { ...o, votes: o.votes + 1 } : o
      );
      return { ...state, options };
    }
  );

  useEffect(() => {
    const hasVoted = localStorage.getItem(`voted-${poll.id}`);
    if (hasVoted) setVoted(true);
  }, [poll.id]);

  const handleVote = (optionId: string) => {
    if (voted) return;
    localStorage.setItem(`voted-${poll.id}`, "true");
    setVoted(true);

    startTransition(async () => {
      addOptimisticVote(optionId);
      await submitVote(optionId, poll.id);
    });
  };

  const totalVotes = optimisticPoll.options.reduce((a, o) => a + o.votes, 0);
  const chartData = optimisticPoll.options.map((o) => ({
    name: o.text,
    votes: o.votes,
  }));

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-center">投票結果</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {optimisticPoll.options.map((o) => {
            const pct = totalVotes > 0 ? (o.votes / totalVotes) * 100 : 0;
            return (
              <div key={o.id}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium">{o.text}</span>
                  <span className="text-sm text-gray-500">
                    {o.votes}票 ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <Button
                  onClick={() => handleVote(o.id)}
                  disabled={voted}
                  className="mt-2"
                >
                  {voted ? "投票済み" : `「${o.text}」に投票`}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-center mb-4">グラフ</h3>
          <ResponsiveContainer
            width="100%"
            height={300}
            initialDimension={{ width: 520, height: 300 }}
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip cursor={{ fill: "#f3f4f6" }} />
              <Bar
                dataKey="votes"
                fill="#3b82f6"
                background={{ fill: "#eee" }}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 動作確認

```bash
npm run dev
```

- ブラウザで `/poll/<ID>` へ（シードの ID 例: `poll1`）。
- クリック即時に UI が+1 → サーバー反映 → `revalidatePath`で同期。

---

## 重複投票防止（実運用の考え方）

- デモでは `localStorage`。
- 本番は以下を検討：
  - 認証＋ DB 一意制約（ユーザー × Poll）
  - 署名付き Cookie ＋サーバー検証
  - レート制限（IP/セッション）

---

## D1 を選ぶ理由と注意点（知識）

- **長所**
  - Workers にネイティブ統合で低レイテンシ・シンプル運用。
  - 少量ライト多数・グローバル配信の相性が良い（投票/カウンタ等）。
- **注意点**
  - 超大規模分析や複雑な拡張（Postgres 拡張等）が必要な場合は、Neon 等のマネージド Postgres を検討。
  - マイグレーションは **drizzle-kit generate → wrangler d1 migrations apply** の流れ。
  - 接続は **URL ではなくバインディング**。Server Action/Route で `env.DB` を都度渡す。

---

## 参考リンク

- Next.js: [Caching and Revalidating](https://nextjs.org/docs/app/building-your-application/caching)
- Next.js: [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions)
- React 19: [useOptimistic](https://react.dev/reference/react/useOptimistic)
- Drizzle: [Cloudflare D1 ガイド](https://orm.drizzle.team/docs/connect-cloudflare-d1)
- shadcn/ui: [Installation on Next](https://ui.shadcn.com/docs/installation/next)
- Recharts: [ResponsiveContainer](https://recharts.org/en-US/api/ResponsiveContainer)

---

## トラブルシュート

- **エラー: DB バインディングが`undefined`**
  - `wrangler.jsonc` の `d1_databases` に `binding: "DB"` が設定されているか確認
  - `wrangler d1 list` で DB が存在するか確認。ID を `wrangler.jsonc` に反映
- **Drizzle の接続で失敗**
  - D1 は URL 接続ではありません。`import { drizzle } from "drizzle-orm/d1"` を使い、`drizzle(env.DB)` になっているか
- **マイグレーションが反映されない**
  - `npx drizzle-kit generate` 後に `wrangler d1 migrations apply 028-vote-db --local/--remote` を実行したか
  - 直接適用する場合は `wrangler d1 execute --file=./drizzle/*/migration.sql`
- **Recharts が SSR で崩れる**
  - `ResponsiveContainer` に `initialDimension` を指定
- **キャッシュが更新されない**
  - Server Action 後に `revalidatePath` を呼んでいるか確認
- **エラー: `fs.readdir` が見つかりません**
  - `wrangler.jsonc` の `compatibility_flags` に `nodejs_compat` が設定されているか確認
  - 設定されていない場合は `wrangler.jsonc` に追加

---

## 本番デプロイ（Cloudflare / OpenNext）

1. D1 にスキーマ/シードを本番へ適用（`--remote`）

```bash
# Drizzle のマイグレーションを適用
npx wrangler d1 migrations apply 028-vote-db --remote

# 任意の初期データ（シード）
npx wrangler d1 execute 028-vote-db --remote --file=./d1/seed.sql
```

2. ビルド＆デプロイ（OpenNext Cloudflare）

```bash
# プレビュー（確認用）
npm run preview

# 本番デプロイ
npm run deploy
```

- 事前に `npx wrangler login` 済みであることを推奨。
- デプロイ後、表示/投票を確認（`/poll/poll1`）。不整合があればダッシュボードでログを確認。
