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
  revalidatePath(`poll/${pollId}`);
}
