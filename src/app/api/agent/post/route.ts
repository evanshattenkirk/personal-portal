import { AgentError, agentPost, checkAgentToken } from "@/lib/agent";

// POST /api/agent/post: an assistant's chat replies and proposals.
// Requires `Authorization: Bearer $PORTAL_AGENT_TOKEN`. See docs/trip-assistant.md.
export async function POST(request: Request) {
  try {
    checkAgentToken(request);
    const text = await request.text();
    if (text.length > 400_000)
      throw new AgentError("Request is too large.", 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AgentError("Send valid JSON.");
    }
    return Response.json(await agentPost(body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof AgentError ? error.status : 500;
    if (status === 500) console.error("Agent post failed", error);
    return Response.json(
      { error: error instanceof AgentError ? error.message : "Server error." },
      { status },
    );
  }
}
