import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CONFIDENCE_THRESHOLD = 70;

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
        JSON.stringify({ confidence: 0, matched: false, status: "bypassed", reason: "API key not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch both images and convert to base64
    const [baselineRes, attendanceRes] = await Promise.all([
      fetch(baselineUrl),
      fetch(attendanceUrl),
    ]);

    if (!baselineRes.ok || !attendanceRes.ok) {
      console.error("Failed to fetch images", {
        baseline: baselineRes.status,
        attendance: attendanceRes.status,
      });
      return new Response(
        JSON.stringify({ confidence: 0, matched: false, status: "bypassed", reason: "Failed to fetch images" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [baselineBuffer, attendanceBuffer] = await Promise.all([
      baselineRes.arrayBuffer(),
      attendanceRes.arrayBuffer(),
    ]);

    // Use chunked base64 encoding to handle large images without stack overflow
    const toBase64 = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return btoa(binary);
    };

    const baselineB64 = toBase64(baselineBuffer);
    const attendanceB64 = toBase64(attendanceBuffer);

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
            content: `You are a strict face verification system used for employee attendance. Your job is to compare two face images and determine if they belong to THE SAME PERSON.

IMPORTANT RULES:
- Be STRICT. Only return high confidence (70+) if the faces clearly belong to the same person.
- Consider facial structure, eye shape, nose shape, jawline, and overall proportions.
- Different people should ALWAYS get confidence below 50, even if they share similar features like glasses, hairstyle, or skin tone.
- If either image does not contain a clear face, return confidence 0.
- Do NOT be lenient. False positives (saying different people match) are much worse than false negatives.

Respond ONLY with a JSON object: {"confidence": <0-100>, "matched": <true/false>}
A confidence of ${CONFIDENCE_THRESHOLD} or above means matched=true. Below ${CONFIDENCE_THRESHOLD} means matched=false.
Do not include any other text, explanation, or markdown.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Compare these two face images strictly. Image 1 is the registered profile photo. Image 2 is the attendance selfie just taken. Are they the SAME person? Be strict — do not match different people.",
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

      // On AI errors, return bypassed with matched=false (don't auto-allow)
      return new Response(
        JSON.stringify({ confidence: 0, matched: false, status: "bypassed", reason: "AI gateway error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse the JSON from AI response
    let confidence = 0;
    let matched = false;
    try {
      const jsonMatch = content.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        confidence = parseInt(parsed.confidence) || 0;
        // Apply our threshold strictly, don't trust AI's matched field
        matched = confidence >= CONFIDENCE_THRESHOLD;
      }
    } catch {
      console.error("Failed to parse AI response:", content);
      // On parse failure, don't match
      matched = false;
    }

    console.log("Face verification result:", { confidence, matched, rawContent: content });

    return new Response(
      JSON.stringify({ confidence, matched, status: matched ? "verified" : "failed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-face-match error:", err);
    return new Response(
      JSON.stringify({ confidence: 0, matched: false, status: "bypassed", reason: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
