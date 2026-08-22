/* =====================================================================
   /.netlify/functions/chat

   Two jobs, both behind a login check:
     action: "chat"        → text + images → a multimodal model
     action: "transcribe"  → a voice note → text (Whisper)

   The OpenRouter key lives here and never reaches the browser.

   Environment variables (Netlify → Site configuration → Environment variables):
     OPENROUTER_API_KEY    required
     SUPABASE_URL          required
     SUPABASE_ANON_KEY     required
     SITE_URL              optional, your deployed URL
     OPENROUTER_MODEL      optional, default below
     OPENROUTER_STT_MODEL  optional, default below
   ===================================================================== */

// Gemini Flash reads text AND images in one model, and is cheap enough
// to leave running for two people.
const DEFAULT_MODEL = "google/gemini-2.5-flash";
// Whisper is duration-priced and accepts the webm that browsers record.
const DEFAULT_STT   = "openai/whisper-1";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;   // ~8MB of base64 audio
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function verifyUser(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

const orHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
  "HTTP-Referer": process.env.SITE_URL || "https://localhost",
  "X-Title": "Bunny's Corner",
});

/* ---------- normalize one message ----------
   Accepts either a plain string, or {text, image} where image is a
   data URI. Anything else is dropped. */
function normalize(m) {
  const role = m.role === "assistant" || m.role === "system" ? m.role : "user";

  if (typeof m.content === "string") {
    return { role, content: m.content.slice(0, 6000) };
  }

  if (m.content && typeof m.content === "object") {
    const parts = [];
    const text = String(m.content.text || "").slice(0, 6000);
    if (text) parts.push({ type: "text", text });

    const img = m.content.image;
    if (typeof img === "string" && img.startsWith("data:image/") && img.length <= MAX_IMAGE_BYTES) {
      parts.push({ type: "image_url", image_url: { url: img } });
    }
    if (parts.length) return { role, content: parts };
  }
  return null;
}

/* ---------- transcribe a voice note ---------- */
async function transcribe(payload) {
  const { audio, format } = payload;
  if (typeof audio !== "string" || !audio) return json(400, { error: "No audio." });
  if (audio.length > MAX_AUDIO_BYTES) return json(413, { error: "That voice note is too long." });

  const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: orHeaders(),
    body: JSON.stringify({
      model: process.env.OPENROUTER_STT_MODEL || DEFAULT_STT,
      input_audio: { data: audio, format: format || "webm" },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json(res.status, { error: data?.error?.message || "Transcription failed." });
  }
  return json(200, { text: (data.text || "").trim() });
}

/* ---------- chat ---------- */
async function chat(payload) {
  const raw = Array.isArray(payload.messages) ? payload.messages : [];
  const messages = raw.slice(-20).map(normalize).filter(Boolean);
  if (!messages.length) return json(400, { error: "No messages." });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: orHeaders(),
    body: JSON.stringify({
      model: payload.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
      max_tokens: Math.min(payload.max_tokens || 500, 1000),
      messages,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json(res.status, { error: data?.error?.message || "Upstream error." });
  }
  return json(200, { content: data?.choices?.[0]?.message?.content || "" });
}

/* ---------- handler ---------- */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  if (!process.env.OPENROUTER_API_KEY) {
    return json(500, { error: "Server is missing OPENROUTER_API_KEY." });
  }

  const auth = event.headers.authorization || event.headers.Authorization || "";
  const user = await verifyUser(auth.replace(/^Bearer\s+/i, ""));
  if (!user) return json(401, { error: "Not signed in." });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Bad JSON." });
  }

  try {
    return payload.action === "transcribe"
      ? await transcribe(payload)
      : await chat(payload);
  } catch (e) {
    return json(502, { error: "Could not reach OpenRouter." });
  }
};
