import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB);
}
