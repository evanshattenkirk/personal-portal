import { connection } from "next/server";
import { AgentError, agentInbox, checkAgentToken } from "@/lib/agent";

// GET /api/agent/inbox: trip context, open notes, and screenshot links for an
// assistant's check. Requires `Authorization: Bearer $PORTAL_AGENT_TOKEN`.
export async function GET(request: Request) {
  // Always answered per request, never prerendered at build time.
  await connection();
  try {
    checkAgentToken(request);
    return Response.json(await agentInbox(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof AgentError ? error.status : 500;
    if (status === 500) console.error("Agent inbox failed", error);
    return Response.json(
      { error: error instanceof AgentError ? error.message : "Server error." },
      { status },
    );
  }
}
