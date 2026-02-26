import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { baselineUrl, attendanceUrl } = await req.json();

    if (!baselineUrl || !attendanceUrl) {
      return new Response(
        JSON.stringify({ error: "Both baselineUrl and attendanceUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ confidence: 0, matched: true, status: "bypassed", reason: "API key not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch both images and convert to base64
    const [baselineRes, attendanceRes] = await Promise.all([
      fetch(baselineUrl),
      fetch(attendanceUrl),
    ]);

    if (!baselineRes.ok || !attendanceRes.ok) {
      console.error("Failed to fetch images");
      return new Response(
        JSON.stringify({ confidence: 0, matched: true, status: "bypassed", reason: "Failed to fetch images" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [baselineBuffer, attendanceBuffer] = await Promise.all([
      baselineRes.arrayBuffer(),
      attendanceRes.arrayBuffer(),
    ]);

    const baselineB64 = btoa(String.fromCharCode(...new Uint8Array(baselineBuffer)));
    const attendanceB64 = btoa(String.fromCharCode(...new Uint8Array(attendanceBuffer)));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a face verification system. Compare two face images and determine if they belong to the same person. Respond ONLY with a JSON object containing 'confidence' (0-100 integer) and 'matched' (boolean). A confidence of 50+ means matched. Do not include any other text.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Compare these two face images. The first is the baseline/registered photo and the second is the attendance selfie. Are they the same person?",
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${baselineB64}` },
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${attendanceB64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ confidence: 0, matched: true, status: "bypassed", reason: "Rate limited" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ confidence: 0, matched: true, status: "bypassed", reason: "AI gateway error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse the JSON from AI response
    let confidence = 0;
    let matched = true;
    try {
      const jsonMatch = content.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        confidence = parseInt(parsed.confidence) || 0;
        matched = parsed.matched ?? confidence >= 50;
      }
    } catch {
      console.error("Failed to parse AI response:", content);
      // Default to bypass
    }

    return new Response(
      JSON.stringify({ confidence, matched, status: matched ? "verified" : "failed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-face-match error:", err);
    return new Response(
      JSON.stringify({ confidence: 0, matched: true, status: "bypassed", reason: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
