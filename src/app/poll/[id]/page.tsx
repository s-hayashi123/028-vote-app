import { getDb } from "@/db/client";
import { poll, pollOption } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { votingUI } from "@/components/voting-ui";

export default async function PollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const [pollRecord] = await db
    .select()
    .from(poll)
    .where(eq(poll.id, id))
    .limit(1);
  if (!pollRecord) notFound();
  const options = await db
    .select()
    .from(pollOption)
    .where(eq(pollOption.pollId, id))
    .orderBy(asc(pollOption.id));
  const data = { ...pollRecord, options } as any;
  return (
    <div>
      <h1>{data.title}</h1>
      <votingUI poll={data} />
    </div>
  );
}
