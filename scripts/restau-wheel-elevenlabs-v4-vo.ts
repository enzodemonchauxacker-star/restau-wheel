/**
 * Restau Wheel — VO française via Higgsfield API + ElevenLabs V4.
 *
 * Génère 6 clips scène (hook → CTA), les télécharge, et écrit
 * artifacts/restau-wheel-kinetic-30s-9x16/vo-clips/ + vo-elevenlabs-v4.json
 *
 * Run: npx tsx scripts/restau-wheel-elevenlabs-v4-vo.ts
 * Requiert HF_CREDENTIALS (key-id:key-secret) dans .env.local
 */
import { config as loadEnv } from "dotenv";
import { config, higgsfield } from "@higgsfield/client/v2";
import fs from "node:fs";
import path from "node:path";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const credentials = process.env.HF_CREDENTIALS;
if (!credentials?.includes(":")) {
  console.error("Missing HF_CREDENTIALS in .env.local (format key-id:key-secret)");
  process.exit(1);
}
config({ credentials });

/** Voix preset Celine (FR SaaS). */
const VOICE_ID = process.env.RW_VOICE_ID || "57ccb351-84d7-54ba-afd4-26b566ca6023";
const VOICE_TYPE = "preset";
const MODEL = "elevenlabs/v4";

const LINES: { name: string; at: number; text: string }[] = [
  {
    name: "hook",
    at: 0.5,
    text: "[energetic clear French commercial] Restau Wheel. Une roue de fortune sur chaque table.",
  },
  {
    name: "flow",
    at: 5.3,
    text: "[energetic clear French commercial] Vos clients scannent le QR, remplissent leur ticket, et tournent la roue.",
  },
  {
    name: "value",
    at: 12.2,
    text: "[energetic clear French commercial] Ils gagnent un lot — dessert, boisson, réduction — et reviennent.",
  },
  {
    name: "control",
    at: 19.3,
    text: "[confident clear French commercial] Vous contrôlez les lots et les probabilités.",
  },
  {
    name: "price",
    at: 23.2,
    text: "[punchy clear French commercial] Vingt euros par mois.",
  },
  {
    name: "cta",
    at: 26.1,
    text: "[warm clear French commercial] Créez votre restaurant sur restauwheel.com.",
  },
];

type AudioResult = {
  status?: string;
  audio?: { url?: string };
  audios?: { url?: string }[];
  url?: string;
};

function pickUrl(result: AudioResult): string | null {
  return result.audio?.url || result.audios?.[0]?.url || result.url || null;
}

async function genLine(line: (typeof LINES)[number], index: number) {
  console.log(`[${index}] elevenlabs_v4 → ${line.name}`);
  const result = (await higgsfield.subscribe(MODEL, {
    input: {
      dialogue: [
        {
          text: line.text,
          voice_id: VOICE_ID,
          voice_type: VOICE_TYPE,
        },
      ],
      stability: 0.45,
      similarity_boost: 0.8,
    },
    withPolling: true,
  })) as AudioResult;

  const url = pickUrl(result);
  if (!url) {
    throw new Error(`no audio url for ${line.name}: ${JSON.stringify(result)}`);
  }
  return { ...line, url, status: result.status || "completed" };
}

async function main() {
  const outDir = path.join("artifacts", "restau-wheel-kinetic-30s-9x16");
  const clipDir = path.join(outDir, "vo-clips");
  fs.mkdirSync(clipDir, { recursive: true });

  const clips = [];
  for (let i = 0; i < LINES.length; i++) {
    const line = LINES[i];
    const generated = await genLine(line, i);
    const file = `${i}-${line.name}.mp3`;
    const dest = path.join(clipDir, file);
    const res = await fetch(generated.url);
    if (!res.ok) throw new Error(`download ${file} failed ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    clips.push({
      name: line.name,
      at: line.at,
      file,
      url: generated.url,
      text: line.text,
    });
    console.log("saved", dest);
  }

  const summary = {
    model: "elevenlabs_v4",
    api_model: MODEL,
    voice: "Celine",
    voice_id: VOICE_ID,
    voice_type: VOICE_TYPE,
    clips,
    at: new Date().toISOString(),
  };
  const metaPath = path.join(outDir, "vo-elevenlabs-v4.json");
  fs.writeFileSync(metaPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nEnsuite: python3 scripts/restau-wheel-kinetic-30s.py --vertical --remux-audio <video.mp4>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
