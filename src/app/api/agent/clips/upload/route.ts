import { connection } from "next/server";
import { AgentError, checkClipAgentToken } from "@/lib/agent";
import { clipFarmUpload, portalOrigin } from "@/lib/clipfarm-agent";

// POST /api/agent/clips/upload { clipId, contentType: "video/mp4", bytes }
// → { uploadUrl, uploadMethod, uploadHeaders, previewUrl }. The pipeline PUTs
// the MP4 to uploadUrl (private bucket), then sets previewUrl on the clip so
// the review card plays it on Evan's phone. Requires CLIPFARM_AGENT_TOKEN (or PORTAL_AGENT_TOKEN).
export async function POST(request: Request) {
  await connection();
  try {
    checkClipAgentToken(request);
    const text = await request.text();
    if (text.length > 10_000) throw new AgentError("Request is too large.", 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AgentError("Send valid JSON.");
    }
    return Response.json(await clipFarmUpload(body, portalOrigin(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof AgentError ? error.status : 500;
    if (status === 500) console.error("Clip preview upload failed", error);
    return Response.json(
      { error: error instanceof AgentError ? error.message : "Server error." },
      { status },
    );
  }
}
