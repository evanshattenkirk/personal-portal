import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AgentError, agentInbox, agentPost, agentScreenshot } from "./agent";
import { proposalKinds } from "./proposals";

// Instant chat replies in the portal, paid for with Evan's ANTHROPIC_API_KEY.
// Costs are kept low on purpose:
// - Everyday replies use a small, fast model with thinking off.
// - Only notes that ask for a lookup (prices, events, deals…) go to a bigger
//   model with web search, capped at a few searches.
// - The long instructions come first and are cached, so repeat chats reuse them.
// - Only this trip's context is sent, trimmed, with at most 4 screenshots.
// - A daily cap stops runaway spend.
// The scheduled daily and weekly checks still run separately as Claude routines.

const CHAT_MODEL =
  process.env.ASSISTANT_CHAT_MODEL?.trim() || "claude-haiku-5-5";
const RESEARCH_MODEL =
  process.env.ASSISTANT_RESEARCH_MODEL?.trim() || "claude-sonnet-5-5";
const DAILY_CAP = Number(process.env.ASSISTANT_DAILY_CAP) || 60;
const MAX_IMAGES = 4;

/** Notes that need fresh information from the web rather than what's in the portal. */
export const needsResearch = (text: string) =>
  /\b(price|prices|cost|costs|fare|fares|deal|deals|cheap|cheapest|book(ing)?|availab|event|events|concert|festival|show|shows|tickets?|what'?s on|happening|look ?up|search|find|research|compare|latest|current|today|this week|flight|flights|hotel|hotels|cruise|cruises|resort|resorts|airbnb|vrbo|points?|miles|transfer bonus|promo)\b/i.test(
    text,
  );

const SYSTEM = `You are Claude, Evan's trip-planning assistant inside his personal portal. Evan writes notes in a trip's chat; you reply there like a helpful friend who did the homework.

How to reply:
- Short, warm, specific. Plain sentences, no headings. Use a short list only when comparing options.
- Answer every open note. When there are several, say which one each part answers (e.g. "On the cruise question: …").
- Use the trip's brief, ideas, ruled-out list, itinerary and bookings. Don't suggest things that were ruled out or that the brief says to skip.
- Look at every screenshot and refer to what's in it.
- Give prices, dates and links when you have them. If a number is an estimate, say so. Never invent a price, an availability or a URL. If you can't check something, say that and suggest how Evan can.
- If you need something from Evan to finish, ask him and leave that note open.
- A note of kind "preference" is something to remember, not a request. Acknowledge it in a few words at most.

The one rule: you never change the plan yourself. Anything that would change it (new ideas to save, a date change, an itinerary item, a task, a deadline) goes in a proposal that Evan confirms in the portal. You never book, buy, cancel or record a reservation. Bookings, points and credits can't be changed by a proposal.

Proposal changes are a list of operations:
- {"op":"create","entity":"suggestions","record":{"title":"…","category":"stay|flight|food|activity|planning","subtitle":"…","priceLabel":"~$650 pp (estimate)","tags":"Cruise","detail":"…","url":"https://…"}}
- {"op":"create","entity":"itinerary","record":{"date":"YYYY-MM-DD","time":"HH:MM","title":"…","location":"…"}}
- {"op":"create","entity":"tasks","record":{"title":"…","dueDate":"YYYY-MM-DD"}}
- {"op":"create","entity":"deadlines","record":{"title":"…","dueDate":"YYYY-MM-DD"}}
- {"op":"update","entity":"trips","id":"<trip id>","patch":{"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","dateLabel":"…"}}
- {"op":"update","entity":"briefs","id":"brief-<tripSlug>","patch":{"vibes":"…"}}
Only use fields shown here. Propose only when it clearly helps; most replies need no proposal.

Answer with only one JSON object, no other text:
{"reply":"your chat message","handledNoteIds":["ids of notes you fully answered"],"proposals":[{"kind":"${proposalKinds.join("|")}","title":"…","body":"why, and what to check","url":"https://… or null","changes":[…]}]}`;

type Parsed = {
  reply?: unknown;
  handledNoteIds?: unknown;
  proposals?: unknown;
};

function parseAnswer(text: string): Parsed {
  const start = text.indexOf("{"),
    end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as Parsed;
    } catch {
      /* fall through: treat the whole answer as the reply */
    }
  }
  return { reply: text.trim(), handledNoteIds: [], proposals: [] };
}

const mediaType = (blob: Blob, path: string) => {
  const t = blob.type;
  if (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(t))
    return t as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "png"
    ? "image/png"
    : ext === "gif"
      ? "image/gif"
      : ext === "webp"
        ? "image/webp"
        : "image/jpeg";
};

/**
 * Replies to Evan's open notes on one trip, right now.
 * Saves the reply and any proposals the same way the assistant API does.
 */
export async function replyInPortal(
  tripSlug: string,
  options: { research?: boolean } = {},
) {
  if (!process.env.ANTHROPIC_API_KEY?.trim())
    throw new AgentError(
      "Add ANTHROPIC_API_KEY in Vercel to turn on instant replies.",
      503,
    );
  const inbox = await agentInbox();
  const entry = inbox.trips.find((t) => t.trip.slug === tripSlug);
  if (!entry) throw new AgentError("That trip isn't active.", 404);
  const open = entry.openNotes;
  if (!open.length)
    return {
      saved: [],
      model: null,
      message: "Nothing is waiting for a reply.",
    };

  const since = Date.now() - 24 * 3600 * 1000;
  const usedToday = inbox.trips
    .flatMap((t) => t.recentConversation)
    .filter(
      (n) => n.author === "claude" && Date.parse(n.createdAt ?? "") > since,
    ).length;
  if (usedToday >= DAILY_CAP)
    throw new AgentError(
      "Today's reply limit is reached. Your daily check will pick this up.",
      429,
    );

  const research =
    options.research ??
    open.some((n) => n.kind !== "preference" && needsResearch(n.body));

  // Context for this trip only. Open notes are listed separately below.
  const context = {
    today: new Date().toISOString().slice(0, 10),
    trip: entry.trip,
    brief: entry.brief,
    ideas: entry.ideas.map((s) => ({
      title: s.title,
      category: s.category,
      subtitle: s.subtitle,
      priceLabel: s.priceLabel,
      tags: s.tags,
      status: s.status,
    })),
    ruledOut: entry.ruledOut,
    scenarios: entry.scenarios,
    itinerary: entry.itinerary,
    bookings: entry.bookings,
    pendingProposals: entry.proposals
      .filter((x) => x.status === "pending")
      .map((x) => x.title),
    recentlyDeclined: entry.proposals
      .filter((x) => x.status === "rejected")
      .slice(-5)
      .map((x) => ({ title: x.title, feedback: x.feedback })),
    conversation: entry.recentConversation.slice(-16).map((n) => ({
      from: n.author,
      kind: n.kind,
      at: n.createdAt,
      body: n.body,
    })),
    wallet: research ? inbox.wallet : undefined,
  };

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: `Trip context:\n${JSON.stringify(context)}` },
  ];
  let images = 0;
  for (const n of open) {
    content.push({
      type: "text",
      text: `Open note id=${n.id} kind=${n.kind} at=${n.createdAt}:\n${n.body}`,
    });
    for (const shot of n.screenshots) {
      if (images >= MAX_IMAGES) break;
      try {
        const blob = await agentScreenshot(shot.path);
        if (blob.size > 4_500_000) continue;
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType(blob, shot.path),
            data: Buffer.from(await blob.arrayBuffer()).toString("base64"),
          },
        });
        images++;
      } catch {
        /* A missing screenshot shouldn't block the reply. */
      }
    }
  }
  content.push({
    type: "text",
    text: research
      ? "Reply to the open notes. Search the web where it helps (a few searches at most) and cite links."
      : "Reply to the open notes using what's in the portal. You can't browse right now; if a note needs fresh prices or events, say your daily or weekly check will look it up, or Evan can tap 'Look it up'.",
  });

  const client = new Anthropic();
  const model = research ? RESEARCH_MODEL : CHAT_MODEL;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
  let response: Anthropic.Message | null = null;
  for (let turn = 0; turn < 3; turn++) {
    try {
      response = await client.messages.create({
        model,
        max_tokens: research ? 6000 : 2000,
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        messages,
        ...(research
          ? {
              tools: [
                {
                  type: "web_search_20260209",
                  name: "web_search",
                  max_uses: 4,
                },
              ],
              output_config: { effort: "medium" },
            }
          : {
              thinking: { type: "disabled" },
              output_config: { effort: "low" },
            }),
      } as Anthropic.MessageCreateParamsNonStreaming);
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        console.error("Claude API error", error.status, error.message);
        throw new AgentError(
          error.status === 401 || error.status === 403
            ? "Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel."
            : error.status === 429
              ? "The API is rate limited right now. Try again in a minute."
              : error.status === 400 && /credit|billing/i.test(error.message)
                ? "Your Anthropic account is out of credits. Add some in the Claude Console."
                : "Claude couldn't reply just now. Try again in a minute.",
          502,
        );
      }
      throw error;
    }
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  if (!response) throw new AgentError("No reply came back.", 502);
  if (response.stop_reason === "refusal")
    throw new AgentError("Claude couldn't answer that one.", 502);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const answer = parseAnswer(text);
  const reply =
    typeof answer.reply === "string" && answer.reply.trim()
      ? answer.reply.trim()
      : "";
  if (!reply)
    throw new AgentError("The reply came back empty. Try again.", 502);
  const openIds = new Set(open.map((n) => n.id));
  const handledNoteIds = (
    Array.isArray(answer.handledNoteIds) ? answer.handledNoteIds : []
  )
    .map(String)
    .filter((id) => openIds.has(id));
  const proposals = (Array.isArray(answer.proposals) ? answer.proposals : [])
    .slice(0, 5)
    .map((x) => ({ ...(x as object), tripSlug }));

  const base = {
    author: "claude",
    source: research ? "portal-research" : "portal-chat",
    handledNoteIds,
  };
  try {
    const result = await agentPost({
      ...base,
      messages: [{ tripSlug, body: reply }],
      proposals,
    });
    return { saved: result.saved, model, message: null };
  } catch (error) {
    if (
      !(error instanceof AgentError) ||
      error.status !== 400 ||
      !proposals.length
    )
      throw error;
    // A malformed proposal shouldn't lose the reply.
    const result = await agentPost({
      ...base,
      messages: [
        {
          tripSlug,
          body: `${reply}\n\n(I had a suggested change too, but it didn't pass the portal's checks: ${error.message})`,
        },
      ],
    });
    return { saved: result.saved, model, message: null };
  }
}
