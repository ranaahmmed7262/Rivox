import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { AccessToken } from "npm:livekit-server-sdk@2.20.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const livekitUrl = Deno.env.get("LIVEKIT_URL");
  const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");

  if (!supabaseUrl || !supabaseAnonKey) return json({ error: "Supabase function environment is incomplete." }, 500);
  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return json({ error: "LiveKit credentials are not configured on the RIVOX backend yet." }, 503);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);

    const body = await req.json().catch(() => ({}));
    const callId = typeof body.callId === "string" ? body.callId : "";
    if (!callId || callId.length > 64) return json({ error: "A valid call ID is required." }, 400);

    const { data: call, error: callError } = await supabase
      .from("call_sessions")
      .select("id, caller_id, callee_id, status")
      .eq("id", callId)
      .maybeSingle();

    if (callError || !call) return json({ error: "Call not found or access denied." }, 404);
    const userId = authData.user.id;
    if (call.caller_id !== userId && call.callee_id !== userId) {
      return json({ error: "You are not a participant in this call." }, 403);
    }
    if (!["ringing", "accepted"].includes(call.status)) {
      return json({ error: "This call is no longer active." }, 409);
    }

    // Use the Supabase UUID as an opaque LiveKit identity; do not expose personal data in room logs.
    const roomName = `rivox-call-${call.id}`;
    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: userId,
      ttl: "1h",
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const participantToken = await token.toJwt();
    return json({ serverUrl: livekitUrl, participantToken, roomName });
  } catch (error) {
    console.error("livekit-token error", error);
    return json({ error: "Unable to create a secure calling token." }, 500);
  }
});
