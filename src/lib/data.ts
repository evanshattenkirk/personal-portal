import { createClient } from "./supabase/server";
import { isOwnerEmail } from "./owner";
import { demoData } from "./demo";
import { emptyData } from "./model";
import { fromRow, optionalTables, tables } from "./records";
import type { EntityName, PortalData } from "./types";
export { fmtMoney, fmtDate, fmtPoints, daysUntil } from "./model";
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
export function isDemoMode() {
  return (
    !isSupabaseConfigured() &&
    (process.env.NEXT_PUBLIC_PORTAL_DEMO === "1" ||
      process.env.NODE_ENV === "development")
  );
}
export function isMisconfiguredProduction() {
  return !isSupabaseConfigured() && !isDemoMode();
}
export async function getPortalData(): Promise<PortalData> {
  if (isDemoMode()) return demoData();
  if (!isSupabaseConfigured())
    throw new Error("The portal database is not configured.");
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || !isPortalOwner(user.email))
    throw new Error("Sign in with the owner account to load your portal.");
  const result = emptyData();
  result.brainstormReady = true;
  result.assistantReady = true;
  await Promise.all(
    (Object.keys(tables) as EntityName[]).map(async (entity) => {
      const { data, error } = await db
        .from(tables[entity])
        .select("*")
        .eq("user_id", user.id);
      if (error && optionalTables.includes(entity)) {
        // Migration 0007 not run yet: keep the rest of the portal working.
        console.error(
          `Portal optional read failed: ${tables[entity]}`,
          error.code,
        );
        if (entity === "proposals") result.assistantReady = false;
        else result.brainstormReady = false;
        return;
      }
      if (error || !data) {
        console.error(`Portal read failed: ${tables[entity]}`, error?.code);
        throw new Error(
          "Your data could not be loaded. Check the connection and database migration. No sample data has been substituted.",
        );
      }
      Object.assign(result, {
        [entity]: data
          .map((r) => fromRow(entity, r))
          .sort(
            (a, b) =>
              Number(("sortOrder" in a ? a.sortOrder : 0) ?? 0) -
              Number(("sortOrder" in b ? b.sortOrder : 0) ?? 0),
          ),
      });
    }),
  );
  const extra = [
    [
      "ledgers",
      "ledgers",
      "id slug name icon totalIn totalOut net netLabel balanceLabel balanceValue entriesCount asOf summary sortOrder",
    ],
    [
      "ledgerEntries",
      "ledger_entries",
      "id ledgerSlug entryDate direction amount fee note sortOrder",
    ],
    [
      "externalTasks",
      "tasks",
      "id externalId title status statusType ownerLabel needsEvan actionNote dueDate url sortOrder",
    ],
  ] as const;
  await Promise.all(
    extra.map(async ([key, table, names]) => {
      const { data, error } = await db
        .from(table)
        .select("*")
        .eq("user_id", user.id);
      if (error || !data) throw new Error(`Could not load ${table}.`);
      Object.assign(result, {
        [key]: data
          .map((row) =>
            Object.fromEntries(
              names
                .split(" ")
                .map((name) => [
                  name,
                  row[name.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase())],
                ]),
            ),
          )
          .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)),
      });
    }),
  );
  const trek = process.env.TREK_URL?.trim();
  if (trek) {
    try {
      const url = new URL(trek);
      if (url.protocol === "https:") result.trekUrl = url.href;
    } catch {
      /* Invalid configured link stays hidden. */
    }
  }
  return result;
}
// Compatibility for isolated server consumers; one shared snapshot powers the app.
export async function getTrips() {
  return (await getPortalData()).trips;
}
export async function getTrip(slug: string) {
  return (await getTrips()).find((t) => t.slug === slug) ?? null;
}
export async function getBookings(slug?: string) {
  return (await getPortalData()).bookings.filter(
    (b) => !slug || b.tripSlug === slug,
  );
}
export async function getPoints() {
  return (await getPortalData()).points;
}
export async function getDeadlines() {
  return (await getPortalData()).deadlines;
}
export async function getLinks() {
  return (await getPortalData()).links;
}
export async function getSuggestions(slug: string) {
  return (await getPortalData()).suggestions.filter((s) => s.tripSlug === slug);
}

export function isPortalOwner(email?: string | null) {
  return isOwnerEmail(email);
}
