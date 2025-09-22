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
