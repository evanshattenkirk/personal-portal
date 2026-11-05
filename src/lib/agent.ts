import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { ownerEmails } from "./owner";
import {
  attachmentBucket,
  fromRow,
  splitAttachments,
  tables,
  toRow,
  validateRecord,
} from "./records";
import { parseChanges, proposalKinds } from "./proposals";
import type { EntityName } from "./types";

// Server-only access for assistants (Claude, Muse, Duet…). Every request needs
// PORTAL_AGENT_TOKEN. Assistants can read trip context and write chat messages
// and proposals. They never change the plan directly: Evan confirms proposals
// in the portal. See docs/trip-assistant.md.

export class AgentError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function checkAgentToken(request: Request) {
  const expected = process.env.PORTAL_AGENT_TOKEN?.trim() ?? "";
  if (expected.length < 32)
    throw new AgentError("The assistant API is not configured.", 503);
  const given = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const a = Buffer.from(given),
    b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new AgentError("Unauthorized.", 401);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new AgentError("The assistant API is not configured.", 503);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ownerId(db: SupabaseClient) {
  const fixed = process.env.PORTAL_OWNER_USER_ID?.trim();
  if (fixed) return fixed;
  const owners = ownerEmails();
  if (!owners.length) throw new AgentError("No portal owner configured.", 503);
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new AgentError("Could not look up the owner.", 500);
  const user = data.users.find((u) =>
    owners.includes(u.email?.toLowerCase() ?? ""),
  );
  if (!user) throw new AgentError("The owner account was not found.", 503);
  return user.id;
}

async function rows<K extends EntityName>(
  db: SupabaseClient,
  uid: string,
  entity: K,
) {
  const { data, error } = await db
    .from(tables[entity])
    .select("*")
    .eq("user_id", uid);
  if (error) throw new AgentError(`Could not read ${tables[entity]}.`, 500);
  return (data ?? []).map((r) => fromRow(entity, r));
}

/** Everything an assistant needs to run a daily or weekly check. */
export async function agentInbox() {
  const db = serviceClient();
  const uid = await ownerId(db);
  const [
    trips,
    briefs,
    notes,
    proposals,
    scenarios,
    suggestions,
    itinerary,
    bookings,
    points,
    credits,
  ] = await Promise.all([
    rows(db, uid, "trips"),
    rows(db, uid, "briefs"),
    rows(db, uid, "notes"),
    rows(db, uid, "proposals"),
    rows(db, uid, "scenarios"),
    rows(db, uid, "suggestions"),
    rows(db, uid, "itinerary"),
    rows(db, uid, "bookings"),
    rows(db, uid, "points"),
    rows(db, uid, "credits"),
  ]);
  const paths = notes.flatMap((n) => splitAttachments(n.attachments));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await db.storage
      .from(attachmentBucket)
      .createSignedUrls(paths, 60 * 60 * 6);
    for (const s of data ?? [])
      if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
  }
  const byTrip = <T extends { tripSlug?: string | null }>(
    list: T[],
    slug: string,
  ) => list.filter((x) => x.tripSlug === slug);
  const active = trips.filter((t) => t.status !== "completed");
  return {
    generatedAt: new Date().toISOString(),
    guide:
      "docs/trip-assistant.md in github.com/evanshattenkirk/personal-portal",
    trips: active.map((trip) => {
      const tripNotes = byTrip(notes, trip.slug).sort((a, b) =>
        (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
      );
      return {
        trip,
        brief: briefs.find((b) => b.tripSlug === trip.slug) ?? null,
        // Evan's notes still waiting for an answer, oldest first.
        openNotes: tripNotes
          .filter((n) => n.status === "open" && (n.author ?? "evan") === "evan")
          .map((n) => ({
            ...n,
            screenshots: splitAttachments(n.attachments).map((p) => ({
              path: p,
              url: signed.get(p) ?? null,
            })),
          })),
        // The last 30 messages either way, so replies read like a conversation.
        recentConversation: tripNotes.slice(-30).map((n) => ({
          id: n.id,
          author: n.author ?? "evan",
          kind: n.kind,
          status: n.status,
          body: n.body,
          createdAt: n.createdAt,
        })),
        proposals: byTrip(proposals, trip.slug).slice(-20),
        scenarios: byTrip(scenarios, trip.slug),
        ideas: byTrip(suggestions, trip.slug).filter(
          (s) => s.status !== "dismissed",
        ),
        ruledOut: byTrip(suggestions, trip.slug)
          .filter((s) => s.status === "dismissed")
          .map((s) => s.title),
        itinerary: byTrip(itinerary, trip.slug).filter(
          (i) => i.status !== "removed",
        ),
        bookings: byTrip(bookings, trip.slug).map((b) => ({
          id: b.id,
          kind: b.kind,
          name: b.name,
          provider: b.provider,
          startDate: b.startDate,
          endDate: b.endDate,
          status: b.status,
          costPaid: b.costPaid,
          pointsCost: b.pointsCost,
          pointsProgram: b.pointsProgram,
          cancelBy: b.cancelBy,
          cancelAt: b.cancelAt,
        })),
      };
    }),
    // Portal-wide context for bonus and deal checks.
    wallet: {
      points: points.map((p) => ({
        program: p.program,
        owner: p.owner,
        balance: p.balance,
        asOf: p.asOf,
      })),
      credits: credits.map((c) => ({
        name: c.name,
        period: c.period,
        limit: c.limit,
        used: c.used,
        resetDate: c.resetDate,
      })),
    },
    pendingPortalWide: proposals.filter(
      (p) => !p.tripSlug && p.status === "pending",
    ),
  };
}

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Writes an assistant's replies and proposals. Validates everything before writing anything. */
export async function agentPost(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AgentError("Send a JSON object.");
  const body = input as Record<string, unknown>;
  const author = str(body.author, 30)?.toLowerCase() ?? "assistant";
  if (!/^[a-z][a-z0-9 _-]{0,29}$/.test(author) || author === "evan")
    throw new AgentError("author must be the assistant's name, e.g. claude.");
  const source = str(body.source, 60);
  const list = (key: string, max: number) => {
    const v = body[key] ?? [];
    if (!Array.isArray(v)) throw new AgentError(`${key} must be a list.`);
    if (v.length > max)
      throw new AgentError(`At most ${max} ${key} per request.`);
    return v as Record<string, unknown>[];
  };
  const now = new Date().toISOString();
  const db = serviceClient();
  const uid = await ownerId(db);
  const { data: tripRows, error: tripError } = await db
    .from("trips")
    .select("slug")
    .eq("user_id", uid);
  if (tripError) throw new AgentError("Could not read trips.", 500);
  const slugs = new Set((tripRows ?? []).map((t) => t.slug as string));
  const checkTrip = (slug: unknown, where: string, optional = false) => {
    if (slug == null && optional) return null;
    if (typeof slug !== "string" || !slugs.has(slug))
      throw new AgentError(`${where}: unknown tripSlug ${String(slug)}.`);
    return slug;
  };
  const messages = list("messages", 40).map((m, i) => {
    try {
      return validateRecord("notes", {
        id: crypto.randomUUID(),
        tripSlug: checkTrip(m.tripSlug, `messages[${i}]`),
        body: str(m.body, 8000) ?? "",
        kind: "note",
        status: "open", // open = Evan hasn't read it yet
        aiReply: null,
        createdAt: now,
        author,
        source,
      });
    } catch (e) {
      throw new AgentError(`messages[${i}]: ${(e as Error).message}`);
    }
  });
  const proposals = list("proposals", 40).map((p, i) => {
    try {
      const kind = String(p.kind ?? "info");
      if (!(proposalKinds as readonly string[]).includes(kind))
        throw new Error(`kind must be one of ${proposalKinds.join(", ")}.`);
      const changes = parseChanges(p.changes ?? []);
      return validateRecord("proposals", {
        id: crypto.randomUUID(),
        tripSlug: checkTrip(p.tripSlug, `proposals[${i}]`, true),
        title: str(p.title, 200) ?? "",
        body: str(p.body, 8000),
        kind,
        changes: changes.length ? JSON.stringify(changes) : null,
        status: "pending",
        author,
        url: str(p.url, 1000),
        createdAt: now,
        decidedAt: null,
        feedback: null,
      });
    } catch (e) {
      throw new AgentError(`proposals[${i}]: ${(e as Error).message}`);
    }
  });
  const handled = list("handledNoteIds", 100).map(String);
  const insert = async (entity: EntityName, records: object[]) => {
    if (!records.length) return [];
    const { data, error } = await db
      .from(tables[entity])
      .insert(
        records.map((r) => ({
          ...toRow(entity, r as Record<string, unknown>),
          user_id: uid,
        })),
      )
      .select("id");
    if (error) throw new AgentError(`Could not save ${tables[entity]}.`, 500);
    return (data ?? []).map((r) => r.id as string);
  };
  const messageIds = await insert("notes", messages);
  const proposalIds = await insert("proposals", proposals);
  let handledCount = 0;
  if (handled.length) {
    const { data, error } = await db
      .from("trip_notes")
      .update({ status: "done" })
      .eq("user_id", uid)
      .eq("author", "evan")
      .in("id", handled)
      .select("id");
    if (error) throw new AgentError("Could not mark notes handled.", 500);
    handledCount = data?.length ?? 0;
  }
  return { messageIds, proposalIds, handledCount };
}
