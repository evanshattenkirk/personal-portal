import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPortalOwner, isSupabaseConfigured } from "@/lib/data";

// GET /api/clips/preview/<clip id>.mp4: the review card's video source.
// Checks the owner session, then redirects to a short-lived signed URL in the
// private clip-previews bucket. The .mp4 suffix lets the card treat it as video.
const BUCKET = "clip-previews";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  await connection();
  const { file } = await params;
  const clipId = file.replace(/\.mp4$/i, "");
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(clipId) || !isSupabaseConfigured())
    return new Response("Not found.", { status: 404 });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || !isPortalOwner(user.email))
    return new Response("Sign in first.", { status: 401 });
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(`${user.id}/${clipId}.mp4`, 60 * 30);
  if (error || !data?.signedUrl) return new Response("Not found.", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, "Cache-Control": "private, no-store" },
  });
}
