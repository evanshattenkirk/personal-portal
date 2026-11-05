"use client";
import type { EntityMap, EntityName } from "@/lib/types";
import { usePortal } from "./PortalProvider";
import { RecordForm, opts, type Field } from "./Kit";
import { todayISO } from "@/lib/model";
export function newRecord(
  entity: EntityName,
  tripSlug: string | null = null,
): Record<string, unknown> {
  const id = crypto.randomUUID(),
    base = { id };
  const records: Record<EntityName, Record<string, unknown>> = {
    trips: {
      ...base,
      slug: "",
      name: "",
      destination: "",
      startDate: null,
      endDate: null,
      dateLabel: "Dates to decide",
      status: "planning",
      travelers: 2,
      notes: null,
      sortOrder: 0,
      selectedScenarioId: null,
    },
    bookings: {
      ...base,
      tripSlug,
      kind: "hotel",
      name: "",
      provider: "",
      startDate: todayISO(),
      endDate: todayISO(),
      details: "",
      confirmation: null,
      secondaryRef: null,
      costPaid: null,
      costNet: null,
      costNote: null,
      pointsCost: null,
      pointsProgram: null,
      cancelBy: null,
      notes: null,
      sortOrder: 0,
      status: "awaiting_confirmation",
      confirmationCheckedAt: null,
      cancelAt: null,
      creditsPosted: 0,
      sourceSuggestionId: null,
    },
    suggestions: {
      ...base,
      tripSlug,
      category: "activity",
      title: "",
      subtitle: null,
      detail: null,
      priceLabel: null,
      url: null,
      source: null,
      status: "suggested",
      sortOrder: 0,
      scenarioId: null,
      itemType: "idea",
      verification: "needs_recheck",
      checkedAt: null,
    },
    tasks: {
      ...base,
      title: "",
      tripSlug,
      bookingId: null,
      dueDate: null,
      status: "todo",
      notes: null,
      snoozedUntil: null,
    },
    deadlines: {
      ...base,
      title: "",
      dueDate: todayISO(),
      status: "open",
      notes: null,
      sortOrder: 0,
      tripSlug,
      snoozedUntil: null,
    },
    scenarios: {
      ...base,
      tripSlug,
      title: "",
      destination: "",
      startDate: null,
      endDate: null,
      summary: null,
      pointsEstimate: null,
      cashEstimate: null,
      availability: "modeled",
      checkedAt: null,
      notes: null,
      status: "considering",
    },
    itinerary: {
      ...base,
      tripSlug,
      date: todayISO(),
      time: null,
      title: "",
      location: null,
      notes: null,
      bookingId: null,
      kind: "plan",
      status: "planned",
    },
    credits: {
      ...base,
      name: "",
      period: "",
      limit: 0,
      used: 0,
      posted: 0,
      resetDate: todayISO(),
      notes: null,
    },
    points: {
      ...base,
      program: "",
      balance: 0,
      owner: "Evan",
      approximate: false,
      asOf: todayISO(),
      sortOrder: 0,
      earmarked: 0,
      tripSlug: null,
    },
    notes: {
      ...base,
      tripSlug,
      body: "",
      kind: "note",
      status: "open",
      aiReply: null,
      createdAt: new Date().toISOString(),
    },
    briefs: {
      ...base,
      tripSlug,
      window: null,
      nights: null,
      styles: null,
      vibes: null,
      avoid: null,
      budget: null,
      origin: null,
      who: null,
      mustHaves: null,
    },
    // Proposals come from assistants and are decided with decideProposal.
    proposals: {
      ...base,
      tripSlug,
      title: "",
      body: null,
      kind: "info",
      changes: null,
      status: "pending",
      author: null,
      url: null,
      createdAt: null,
      decidedAt: null,
      feedback: null,
    },
    links: {
      ...base,
      name: "",
      url: null,
      description: "",
      category: "Projects",
      sortOrder: 0,
      pinned: false,
      location: null,
    },
  };
  return records[entity];
}
const field = (
  key: string,
  label: string,
  type = "text",
  required = false,
  hint?: string,
): Field => ({ key, label, type, required, hint });
export function EntityEditor({
  entity,
  record,
  onClose,
}: {
  entity: EntityName;
  record: Record<string, unknown>;
  onClose: () => void;
}) {
  const p = usePortal();
  const tripOptions = p.trips.map((t) => ({ value: t.slug, label: t.name }));
  const select = (
    key: string,
    label: string,
    values: string[],
    required = true,
  ): Field => ({ key, label, options: opts(values), required });
  const related: Field = {
    key: "tripSlug",
    label: "Related trip",
    options: tripOptions,
  };
  const notes = field("notes", "Notes", "textarea");
  const fields: Record<EntityName, Field[]> = {
    trips: [
      field("name", "Trip name", "text", true),
      {
        ...field(
          "slug",
          "Trip address",
          "text",
          true,
          "A permanent name such as summer-in-italy.",
        ),
        readOnly: p.trips.some((t) => t.id === record.id),
      },
      field("destination", "Destination", "text", true),
      field("travelers", "Travelers", "number"),
      field("startDate", "Start date", "date"),
      field("endDate", "End date", "date"),
      field("dateLabel", "Flexible date description", "text", true),
      select("status", "Planning stage", [
        "planning",
        "researching",
        "completed",
      ]),
      notes,
    ],
    bookings: [
      { ...related, required: true },
      select("kind", "Reservation type", [
        "hotel",
        "flight",
        "car",
        "activity",
        "other",
      ]),
      field("name", "Reservation name", "text", true),
      field("provider", "Booked through", "text", true),
      field("startDate", "Start date", "date", true),
      field("endDate", "End date", "date", true),
      field("details", "Room / route / travelers"),
      select("status", "Reservation state", [
        "needs_review",
        "awaiting_confirmation",
        "confirmed",
        "cancelled",
      ]),
      field(
        "confirmation",
        "Confirmation reference",
        "text",
        false,
        "Required for Confirmed. Copy it from the reservation.",
      ),
      field("secondaryRef", "Additional reference"),
      field(
        "confirmationCheckedAt",
        "Confirmation checked on",
        "date",
        false,
        "Required for Confirmed. This records your verification.",
      ),
      field("cancelBy", "Cancellation terms as written"),
      field(
        "cancelAt",
        "Exact cancellation deadline",
        "text",
        false,
        "Include timezone: 2027-03-20T16:00:00-07:00. Leave blank until verified.",
      ),
      field("costPaid", "Cash paid (USD)", "number"),
      field("costNet", "Projected net after expected credits (USD)", "number"),
      field("creditsPosted", "Credits actually posted (USD)", "number"),
      field("costNote", "Cost / credit explanation"),
      field("pointsCost", "Points used", "number"),
      field("pointsProgram", "Points program"),
      notes,
    ],
    suggestions: [
      { ...related, required: true },
      field("title", "Idea title", "text", true),
      select("category", "Category", [
        "stay",
        "flight",
        "food",
        "activity",
        "planning",
      ]),
      select("itemType", "Item type", ["idea", "task", "reference"]),
      field("subtitle", "One-line summary"),
      field("priceLabel", "Cost / points estimate"),
      field("url", "Source or booking link", "url"),
      select("status", "Shortlist state", ["suggested", "saved", "dismissed"]),
      select("verification", "Availability evidence", [
        "modeled",
        "needs_recheck",
        "checked",
      ]),
      field("checkedAt", "Last checked", "date"),
      field("source", "Research source"),
      {
        key: "scenarioId",
        label: "Scenario",
        options: p.scenarios
          .filter((s) => s.tripSlug === record.tripSlug)
          .map((s) => ({ value: s.id, label: s.title })),
      },
      ...(p.brainstormReady
        ? [
            field(
              "tags",
              "Tags",
              "text",
              false,
              "Comma-separated, e.g. cruise, all-inclusive, live music.",
            ),
          ]
        : []),
      field("detail", "Research and caveats", "textarea"),
    ],
    tasks: [
      field("title", "Next action", "text", true),
      related,
      field("dueDate", "Due date", "date"),
      select("status", "Status", ["todo", "waiting", "done"]),
      {
        key: "bookingId",
        label: "Related reservation",
        options: p.bookings
          .filter((b) => b.tripSlug === record.tripSlug)
          .map((b) => ({ value: b.id, label: b.name })),
      },
      field(
        "snoozedUntil",
        "Hide from priorities until",
        "date",
        false,
        "This does not change the original due date.",
      ),
      notes,
    ],
    deadlines: [
      field("title", "Deadline", "text", true),
      field("dueDate", "Due date", "date", true),
      related,
      select("status", "Status", ["open", "watching", "done"]),
      field(
        "snoozedUntil",
        "Reminder snoozed until",
        "date",
        false,
        "The deadline remains unchanged.",
      ),
      notes,
    ],
    scenarios: [
      field("title", "Scenario name", "text", true),
      field("destination", "Destination", "text", true),
      field("startDate", "Start date", "date"),
      field("endDate", "End date", "date"),
      field("summary", "Travelers and routes", "textarea"),
      field("pointsEstimate", "Points estimate"),
      field("cashEstimate", "Cash estimate"),
      select("availability", "Availability evidence", [
        "modeled",
        "needs_recheck",
        "checked",
      ]),
      field("checkedAt", "Last checked", "date"),
      select("status", "Comparison state", ["considering", "ruled_out"]),
      notes,
    ],
    itinerary: [
      field("title", "Plan", "text", true),
      field("date", "Date", "date", true),
      field("time", "Local time at destination", "time"),
      field("location", "Place / address"),
      select("status", "Status", ["planned", "removed"]),
      notes,
    ],
    credits: [
      field("name", "Credit name", "text", true),
      field("period", "Period, e.g. November 2026", "text", true),
      field("limit", "Allowance (USD)", "number", true),
      field("used", "Eligible spend submitted (USD)", "number", true),
      field("posted", "Credit received (USD)", "number", true),
      field("resetDate", "Period ends / resets", "date", true),
      notes,
    ],
    points: [
      field("program", "Program", "text", true),
      field("owner", "Account owner", "text", true),
      field("balance", "Balance", "number", true),
      field("asOf", "Balance checked on", "date", true),
      field("approximate", "Approximate balance", "checkbox"),
      field("earmarked", "Points earmarked for a trip", "number"),
      related,
    ],
    notes: [
      {
        key: "kind",
        label: "What kind of note",
        required: true,
        options: [
          { value: "note", label: "Note / thought" },
          { value: "ask_ai", label: "Ask my AI to do this" },
          { value: "preference", label: "Preference to remember" },
        ],
      },
      select("status", "Status", ["open", "done"]),
      field("body", "Note", "textarea", true),
      field(
        "aiReply",
        "What your AI did or said",
        "textarea",
        false,
        "Paste the answer back here so the note keeps its history.",
      ),
    ],
    briefs: [
      field("window", "When", "text", false, "e.g. Mid April 2027"),
      field("nights", "Nights", "text", false, "e.g. 4-5"),
      field("who", "Who's coming"),
      field("origin", "Leaving from", "text", false, "Home airport or city"),
      field("budget", "Budget feel", "text", false, "e.g. $4-6k total"),
      field(
        "styles",
        "Trip styles to explore",
        "text",
        false,
        "Comma-separated: cruise, Airbnb/VRBO, all-inclusive…",
      ),
      field(
        "vibes",
        "What we want",
        "text",
        false,
        "Comma-separated: food, drinks, live music…",
      ),
      field("avoid", "Skip", "text", false, "Comma-separated: hiking, skiing…"),
      field("mustHaves", "Must-haves and dealbreakers", "textarea"),
    ],
    proposals: [],
    links: [
      field("name", "Resource name", "text", true),
      field("category", "Category", "text", true),
      field("url", "Web address (public or private)", "url"),
      field("location", "Local file path or access instructions"),
      field("pinned", "Pin to Home", "checkbox"),
      field("description", "Description", "textarea"),
    ],
  };
  const names: Record<EntityName, string> = {
    trips: "Trip details",
    bookings: "Record a reservation",
    suggestions: "Idea & research",
    tasks: "Next action",
    deadlines: "Deadline",
    scenarios: "Compare a possibility",
    itinerary: "Add to the day",
    credits: "Credit period",
    points: "Points balance",
    links: "Resource",
    notes: "Note for your AI",
    briefs: "What this trip should feel like",
    proposals: "Proposal",
  };
  const initial = { ...record };
  if (entity === "bookings") {
    initial.status ??= "needs_review";
    initial.creditsPosted ??= 0;
  }
  if (entity === "suggestions") {
    initial.itemType ??= "idea";
    initial.verification ??= "needs_recheck";
    if (initial.status === "booked") initial.status = "saved";
  }
  if (entity === "trips" && initial.status === "booked")
    initial.status = "planning";
  return (
    <RecordForm
      title={names[entity]}
      fields={fields[entity]}
      initial={initial}
      onClose={onClose}
      onSave={async (r) => {
        if (
          entity === "scenarios" &&
          r.status === "ruled_out" &&
          p.trips.some((t) => t.selectedScenarioId === r.id)
        )
          throw new Error(
            "Choose a different scenario before ruling out your selected plan.",
          );
        await p.save(entity, r as unknown as EntityMap[typeof entity]);
      }}
    />
  );
}
