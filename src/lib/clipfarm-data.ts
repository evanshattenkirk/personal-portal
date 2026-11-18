import { createClient } from "./supabase/server";
import { isDemoMode, isPortalOwner, isSupabaseConfigured } from "./data";
import { clipFarmDemo } from "./clipfarm-demo";
import { emptyClipFarm, type ClipFarmData } from "./clipfarm";
import { clipTables, fromClipRow, type ClipEntity } from "./clipfarm-records";
import { readHistory } from "./clipfarm-history";

const keys: ClipEntity[] = ["campaigns", "accounts", "clips", "payouts"];

/** The signed-in owner's Clip Farm. Before migration 0011, returns ready: false instead of failing. */
export async function getClipFarmData(): Promise<ClipFarmData> {
  if (isDemoMode()) return clipFarmDemo();
  if (!isSupabaseConfigured())
    throw new Error("The portal database is not configured.");
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || !isPortalOwner(user.email))
    throw new Error("Sign in with the owner account to load the Clip Farm.");
  const result = emptyClipFarm();
  const [reads, history] = await Promise.all([
    Promise.all(
      keys.map((k) => db.from(clipTables[k]).select("*").eq("user_id", user.id)),
    ),
    // Before migration 0012 this is empty and historyReady is false.
    readHistory(db, user.id),
  ]);
  Object.assign(result, history);
  for (const [i, { data, error }] of reads.entries()) {
    if (error) {
      // 42P01 = table missing: the migration hasn't run yet.
      if (error.code === "42P01" || error.code === "PGRST205")
        return emptyClipFarm(false, false);
      console.error(`Clip Farm read failed: ${clipTables[keys[i]]}`, error.code);
      throw new Error("Your Clip Farm could not be loaded.");
    }
    Object.assign(result, {
      [keys[i]]: (data ?? []).map((r) => fromClipRow(keys[i], r)),
    });
  }
  result.campaigns.sort((a, b) => a.sortOrder - b.sortOrder);
  result.accounts.sort((a, b) => a.sortOrder - b.sortOrder);
  result.clips.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return result;
}
