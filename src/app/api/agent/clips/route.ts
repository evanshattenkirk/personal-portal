import { connection } from "next/server";
import { AgentError, checkAgentToken } from "@/lib/agent";
import { clipFarmInbox, clipFarmPost } from "@/lib/clipfarm-agent";

// /api/agent/clips: the clipping pipeline's door into the Clip Farm.
// GET  → ranked campaigns, accounts, approved clips to post, clips to track.
// POST → { clips: [...], accounts: [...] } adds clips to review, marks
//        approved clips posted, and refreshes stats. It can never approve.
// Requires `Authorization: Bearer $PORTAL_AGENT_TOKEN`. See docs/clip-farm.md.
function failure(error: unknown, what: string) {
  const status = error instanceof AgentError ? error.status : 500;
  if (status === 500) console.error(`Clip Farm ${what} failed`, error);
  return Response.json(
    { error: error instanceof AgentError ? error.message : "Server error." },
    { status },
  );
}

export async function GET(request: Request) {
  await connection();
  try {
    checkAgentToken(request);
    return Response.json(await clipFarmInbox(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error, "inbox");
  }
}

export async function POST(request: Request) {
  await connection();
  try {
    checkAgentToken(request);
    const text = await request.text();
    if (text.length > 400_000) throw new AgentError("Request is too large.", 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AgentError("Send valid JSON.");
    }
    return Response.json(await clipFarmPost(body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error, "post");
  }
}
