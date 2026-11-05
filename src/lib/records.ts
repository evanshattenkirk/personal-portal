import type { EntityMap, EntityName } from "./types";
export const tables: Record<EntityName, string> = {
  trips: "trips",
  bookings: "bookings",
  suggestions: "trip_suggestions",
  deadlines: "deadlines",
  points: "points_balances",
  links: "links",
  tasks: "portal_tasks",
  scenarios: "trip_scenarios",
  itinerary: "itinerary_items",
  credits: "credit_periods",
  notes: "trip_notes",
  briefs: "trip_briefs",
  proposals: "trip_proposals",
};
// Added by migrations 0007/0008. Reads tolerate them missing so the portal keeps working.
export const optionalTables: EntityName[] = ["notes", "briefs", "proposals"];
// Screenshot attachments are private storage paths: <user id>/<trip>/<file>.
export const attachmentBucket = "trip-notes";
export const attachmentPattern =
  /^[0-9a-f-]{36}\/[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9._-]{1,120}$/;
export const splitAttachments = (value?: string | null) =>
  (value ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
export const fields: Record<EntityName, string[]> = {
  trips:
    "id slug name destination startDate endDate dateLabel status travelers notes sortOrder selectedScenarioId".split(
      " ",
    ),
  bookings:
    "id tripSlug kind name provider startDate endDate details confirmation secondaryRef costPaid costNet costNote pointsCost pointsProgram cancelBy notes sortOrder status confirmationCheckedAt cancelAt creditsPosted sourceSuggestionId".split(
      " ",
    ),
  suggestions:
    "id tripSlug category title subtitle detail priceLabel url source status sortOrder scenarioId itemType verification checkedAt tags".split(
      " ",
    ),
  deadlines:
    "id title dueDate status notes sortOrder snoozedUntil tripSlug".split(" "),
  points:
    "id program balance owner approximate asOf sortOrder earmarked tripSlug".split(
      " ",
    ),
  links: "id name url description category sortOrder pinned location".split(
    " ",
  ),
  tasks: "id title tripSlug bookingId dueDate status notes snoozedUntil".split(
    " ",
  ),
  scenarios:
    "id tripSlug title destination startDate endDate summary pointsEstimate cashEstimate availability checkedAt notes status".split(
      " ",
    ),
  itinerary:
    "id tripSlug date time title location notes bookingId kind status".split(
      " ",
    ),
  credits: "id name period limit used posted resetDate notes".split(" "),
  notes:
    "id tripSlug body kind status aiReply createdAt author attachments source".split(
      " ",
    ),
  proposals:
    "id tripSlug title body kind changes status author url createdAt decidedAt feedback".split(
      " ",
    ),
  briefs:
    "id tripSlug window nights styles vibes avoid budget origin who mustHaves".split(
      " ",
    ),
};
export const snake = (s: string) =>
  s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
export function fromRow<K extends EntityName>(
  entity: K,
  row: Record<string, unknown>,
): EntityMap[K] {
  return Object.fromEntries(
    fields[entity]
      .filter((f) => row[snake(f)] !== undefined)
      .map((f) => [f, row[snake(f)]]),
  ) as unknown as EntityMap[K];
}
export function toRow(entity: EntityName, row: Record<string, unknown>) {
  return Object.fromEntries(
    fields[entity]
      .filter((f) => row[f] !== undefined)
      .map((f) => [snake(f), row[f]]),
  );
}
const choices: Partial<Record<EntityName, Record<string, string[]>>> = {
  trips: { status: ["planning", "researching", "booked", "completed"] },
  bookings: {
    status: ["needs_review", "awaiting_confirmation", "confirmed", "cancelled"],
    kind: ["hotel", "flight", "car", "activity", "other"],
  },
  suggestions: {
    status: ["suggested", "saved", "booked", "dismissed"],
    category: ["planning", "flight", "food", "activity", "stay"],
    itemType: ["idea", "task", "reference"],
    verification: ["modeled", "needs_recheck", "checked"],
  },
  tasks: { status: ["todo", "waiting", "done"] },
  deadlines: { status: ["open", "done", "watching"] },
  scenarios: {
    status: ["considering", "selected", "ruled_out"],
    availability: ["modeled", "needs_recheck", "checked"],
  },
  itinerary: { kind: ["plan", "reservation"], status: ["planned", "removed"] },
  notes: { kind: ["note", "ask_ai", "preference"], status: ["open", "done"] },
  proposals: {
    kind: [
      "plan_change",
      "idea",
      "event",
      "deal",
      "price_drop",
      "bonus",
      "info",
    ],
    status: ["pending", "accepted", "rejected"],
  },
};
const required: Record<EntityName, string[]> = {
  trips: ["slug", "name", "destination", "dateLabel", "status"],
  bookings: [
    "tripSlug",
    "kind",
    "name",
    "provider",
    "startDate",
    "endDate",
    "status",
  ],
  suggestions: ["tripSlug", "category", "title", "status"],
  deadlines: ["title", "dueDate", "status"],
  points: ["program", "owner", "asOf"],
  links: ["name", "category"],
  tasks: ["title", "status"],
  scenarios: ["tripSlug", "title", "destination", "status", "availability"],
  itinerary: ["tripSlug", "date", "title", "kind", "status"],
  credits: ["name", "period", "resetDate"],
  notes: ["tripSlug", "body", "kind", "status"],
  briefs: ["tripSlug"],
  proposals: ["title", "kind", "status"],
};
export function validateRecord<K extends EntityName>(
  entity: K,
  input: unknown,
): EntityMap[K] {
  if (
    !Object.hasOwn(tables, entity) ||
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  )
    throw new Error("Invalid record.");
  const r = input as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id.trim() || r.id.length > 150)
    throw new Error("A record ID is required.");
  for (const f of Object.keys(r))
    if (!fields[entity].includes(f)) throw new Error(`Unexpected field: ${f}`);
  for (const f of required[entity])
    if (typeof r[f] !== "string" || !String(r[f]).trim())
      throw new Error(`${f} is required.`);
  for (const [f, v] of Object.entries(r)) {
    if (v === null || v === undefined) continue;
    if (
      ![
        "balance",
        "earmarked",
        "costPaid",
        "costNet",
        "creditsPosted",
        "pointsCost",
        "limit",
        "used",
        "posted",
        "travelers",
        "sortOrder",
        "pinned",
        "approximate",
      ].includes(f) &&
      typeof v !== "string"
    )
      throw new Error(`Invalid ${f}.`);
    if (typeof v === "object" || (typeof v === "string" && v.length > 20000))
      throw new Error(`Invalid ${f}.`);
    if (
      (/Date$/.test(f) ||
        [
          "date",
          "asOf",
          "checkedAt",
          "confirmationCheckedAt",
          "snoozedUntil",
        ].includes(f)) &&
      (typeof v !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v + "T12:00:00Z")) ||
        new Date(v + "T12:00:00Z").toISOString().slice(0, 10) !== v)
    )
      throw new Error(`Use a valid date for ${f}.`);
    if (
      [
        "balance",
        "earmarked",
        "costPaid",
        "costNet",
        "creditsPosted",
        "pointsCost",
        "limit",
        "used",
        "posted",
        "travelers",
      ].includes(f) &&
      (typeof v !== "number" || !Number.isFinite(v) || v < 0)
    )
      throw new Error(`${f} must be a non-negative number.`);
    if (
      ["balance", "earmarked", "pointsCost", "travelers", "sortOrder"].includes(
        f,
      ) &&
      !Number.isSafeInteger(v)
    )
      throw new Error(`${f} must be a whole number.`);
    if (["pinned", "approximate"].includes(f) && typeof v !== "boolean")
      throw new Error(`Invalid ${f}.`);
  }
  for (const [f, values] of Object.entries(choices[entity] ?? {}) as [
    string,
    string[],
  ][])
    if (r[f] != null && !values.includes(String(r[f])))
      throw new Error(`Invalid ${f}.`);
  if (r.startDate && r.endDate && String(r.endDate) < String(r.startDate))
    throw new Error("End date must follow the start date.");
  if (r.url && (typeof r.url !== "string" || !/^https?:\/\//i.test(r.url)))
    throw new Error("Use an http or https URL.");
  if (r.url) {
    try {
      new URL(String(r.url));
    } catch {
      throw new Error("Use a valid URL.");
    }
  }
  if (entity === "trips" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(r.slug)))
    throw new Error(
      "Trip address must use lowercase words separated by hyphens.",
    );
  if (entity === "bookings") {
    if (
      r.status === "confirmed" &&
      (!String(r.confirmation ?? "").trim() || !r.confirmationCheckedAt)
    )
      throw new Error(
        "Confirmation reference and checked date are required to confirm a reservation.",
      );
    if (
      r.cancelAt &&
      (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(String(r.cancelAt)) ||
        !Number.isFinite(Date.parse(String(r.cancelAt))))
    )
      throw new Error(
        "Cancellation deadline needs an ISO time with timezone, e.g. 2027-03-17T00:00:00-07:00.",
      );
    if (
      r.costNet != null &&
      r.costPaid != null &&
      Number(r.costNet) > Number(r.costPaid)
    )
      throw new Error("Projected net cannot exceed paid cost.");
    if (Number(r.creditsPosted ?? 0) > Number(r.costPaid ?? 0))
      throw new Error("Posted credits cannot exceed the amount paid.");
  }
  if (entity === "points" && Number(r.earmarked ?? 0) > Number(r.balance))
    throw new Error("Earmarked points cannot exceed the balance.");
  if (
    entity === "credits" &&
    (Number(r.posted) > Number(r.used) || Number(r.used) > Number(r.limit))
  )
    throw new Error("Amounts must satisfy posted ≤ used ≤ allowance.");
  if (entity === "notes") {
    const paths = splitAttachments(r.attachments as string | null);
    if (paths.length > 8)
      throw new Error("Attach up to 8 screenshots per note.");
    if (paths.some((path) => !attachmentPattern.test(path)))
      throw new Error("Invalid attachment.");
    if (r.author != null && !/^[a-z][a-z0-9 _-]{0,30}$/i.test(String(r.author)))
      throw new Error("Invalid author.");
  }
  if (
    entity === "itinerary" &&
    r.time &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(r.time))
  )
    throw new Error("Use a valid 24-hour time.");
  return r as unknown as EntityMap[K];
}
