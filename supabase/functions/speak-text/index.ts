import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Reads a summary aloud: text -> MP3 (base64) via Lovable AI text-to-speech. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, voice } = await req.json().catch(() => ({}));
    if (!text || typeof text !== "string") return json({ error: "text is required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    // Keep well under the model's input cap — briefings are short by design.
    const input = text.slice(0, 3500);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input,
        voice: voice || "alloy",
        response_format: "mp3",
        instructions: "Read as a confident, warm business analyst delivering an executive briefing. Clear pace, natural pauses.",
      }),
    });

    if (res.status === 429) return json({ error: "AI rate limit reached. Please try again shortly." }, 429);
    if (res.status === 402) return json({ error: "AI credits exhausted. Please top up workspace credits." }, 402);
    if (!res.ok) {
      const body = await res.text();
      console.error("TTS gateway error", res.status, body);
      return json({ error: "Speech generation failed", details: body }, 502);
    }

    const buf = await res.arrayBuffer();
    return json({ audio: base64Encode(buf), mime: "audio/mpeg" });
  } catch (err) {
    console.error("speak-text failed:", err);
    return json({ error: (err as Error).message || "Unexpected error" }, 500);
  }
});
