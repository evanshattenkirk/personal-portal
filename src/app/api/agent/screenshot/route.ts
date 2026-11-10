import { connection } from "next/server";
import { AgentError, agentScreenshot, checkAgentToken } from "@/lib/agent";

// GET /api/agent/screenshot?path=<attachment path>: one note screenshot,
// streamed through the portal so assistants only need to reach this host.
// Requires `Authorization: Bearer $PORTAL_AGENT_TOKEN`.
export async function GET(request: Request) {
  // Always answered per request, never prerendered at build time.
  await connection();
  try {
    checkAgentToken(request);
    const path = new URL(request.url).searchParams.get("path") ?? "";
    const file = await agentScreenshot(path);
    return new Response(file, {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof AgentError ? error.status : 500;
    if (status === 500) console.error("Agent screenshot failed", error);
    return Response.json(
      { error: error instanceof AgentError ? error.message : "Server error." },
      { status },
    );
  }
}
