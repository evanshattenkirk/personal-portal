import { fields, validateRecord } from "./records.ts";
export { attachmentPattern, splitAttachments } from "./records.ts";
import type { EntityName } from "./types";

// What an AI (Claude, Muse, Duet…) may change through a proposal, and how.
// Nothing here runs until Evan confirms the proposal in the portal.
// Bookings, points and credits are records of real transactions, so an AI can
// only suggest them in words, never write them.
export const proposalEntities = {
  trips: ["update"],
  briefs: ["create", "update"],
  suggestions: ["create", "update"],
  scenarios: ["create", "update"],
  itinerary: ["create", "update"],
  tasks: ["create", "update"],
  deadlines: ["create", "update"],
} as const satisfies Partial<
  Record<EntityName, readonly ("create" | "update")[]>
>;
export type ProposalEntity = keyof typeof proposalEntities;

export const proposalKinds = [
  "plan_change",
  "idea",
  "event",
  "deal",
  "price_drop",
  "bonus",
  "info",
] as const;
export type ProposalKind = (typeof proposalKinds)[number];

export const proposalKindLabel: Record<ProposalKind, string> = {
  plan_change: "Plan change",
  idea: "Ideas",
  event: "Event",
  deal: "Deal",
  price_drop: "Price drop",
  bonus: "Bonus",
  info: "Heads-up",
};

export type ProposalChange =
  | { op: "create"; entity: ProposalEntity; record: Record<string, unknown> }
  | {
      op: "update";
      entity: ProposalEntity;
      id: string;
      patch: Record<string, unknown>;
    };

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Parses and shape-checks a proposal's change list. Throws a readable error. */
export function parseChanges(raw: unknown): ProposalChange[] {
  let value = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("The proposed changes aren't valid JSON.");
    }
  }
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Changes must be a list.");
  if (value.length > 30)
    throw new Error("A proposal can hold at most 30 changes.");
  return value.map((c, i) => {
    const where = `Change ${i + 1}`;
    if (!isObj(c)) throw new Error(`${where} is not an object.`);
    const entity = c.entity as ProposalEntity;
    if (!Object.hasOwn(proposalEntities, entity))
      throw new Error(
        `${where}: ${String(c.entity)} can't be changed by a proposal.`,
      );
    const allowed = proposalEntities[entity] as readonly string[];
    if (!allowed.includes(String(c.op)))
      throw new Error(`${where}: ${String(c.op)} isn't allowed for ${entity}.`);
    const body = c.op === "create" ? c.record : c.patch;
    if (!isObj(body))
      throw new Error(
        `${where} needs ${c.op === "create" ? "a record" : "a patch"}.`,
      );
    for (const f of Object.keys(body))
      if (!fields[entity].includes(f))
        throw new Error(`${where}: unknown field ${f}.`);
    if (c.op === "update") {
      if (typeof c.id !== "string" || !c.id.trim())
        throw new Error(`${where} needs the id to update.`);
      if ("id" in body && body.id !== c.id)
        throw new Error(`${where} can't change an id.`);
      if (entity === "trips" && "slug" in body)
        throw new Error(`${where} can't change a trip address.`);
      return { op: "update", entity, id: c.id, patch: body };
    }
    return { op: "create", entity, record: body };
  });
}

/** Builds the full record a change will save, given the existing one for updates. */
export function resolveChange(
  change: ProposalChange,
  existing: Record<string, unknown> | null,
  defaults: { tripSlug: string | null; id: string },
): Record<string, unknown> {
  if (change.op === "update") {
    if (!existing)
      throw new Error(
        `The ${change.entity} record to update no longer exists.`,
      );
    return validateRecord(change.entity, {
      ...existing,
      ...change.patch,
    }) as unknown as Record<string, unknown>;
  }
  // A create always gets a new id, so it can't quietly overwrite something.
  // A trip's brief is the exception: it has one well-known id per trip.
  const record: Record<string, unknown> = {
    ...change.record,
    id:
      change.entity === "briefs" && typeof change.record.id === "string"
        ? change.record.id
        : defaults.id,
  };
  if (
    fields[change.entity].includes("tripSlug") &&
    record.tripSlug == null &&
    defaults.tripSlug
  )
    record.tripSlug = defaults.tripSlug;
  if (change.entity === "suggestions") {
    record.status ??= "suggested";
    record.itemType ??= "idea";
    record.verification ??= "modeled";
    record.sortOrder ??= 0;
    if (record.status === "booked")
      throw new Error("A proposal can't mark something booked.");
  }
  if (change.entity === "tasks") record.status ??= "todo";
  if (change.entity === "deadlines") record.status ??= "open";
  if (change.entity === "itinerary") {
    record.kind ??= "plan";
    record.status ??= "planned";
  }
  if (change.entity === "scenarios") {
    record.status ??= "considering";
    record.availability ??= "modeled";
  }
  return validateRecord(change.entity, record) as unknown as Record<
    string,
    unknown
  >;
}

/** One-line human summary of a change, for the confirm card. */
export function describeChange(c: ProposalChange) {
  const noun: Record<ProposalEntity, string> = {
    trips: "trip details",
    briefs: "trip brief",
    suggestions: "idea",
    scenarios: "option to compare",
    itinerary: "plan for a day",
    tasks: "to-do",
    deadlines: "deadline",
  };
  if (c.op === "create") {
    const r = c.record;
    const name = r.title ?? r.name ?? "";
    const when = r.date ?? r.dueDate ?? "";
    return `Add ${noun[c.entity]}${name ? `: ${name}` : ""}${when ? ` (${when})` : ""}`;
  }
  return `Update ${noun[c.entity]}: ${Object.keys(c.patch).join(", ")}`;
}
