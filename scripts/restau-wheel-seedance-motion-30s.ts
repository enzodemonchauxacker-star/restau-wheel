/**
 * Restau Wheel — 30s kinetic motion-design explainer via Higgsfield API (Seedance 2.5).
 * Uses @higgsfield/client + HF_CREDENTIALS (not Higgsedit).
 *
 * Run: npx tsx scripts/restau-wheel-seedance-motion-30s.ts
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

const CDN = "https://d2ol7oe51mr4n9.cloudfront.net/user_3FtfBHx3ODuHtkhLTPM9V4BijnV";

const refs = {
  landing: `${CDN}/a14c00f3-9035-4496-aaa3-ccbdd4548057.png`,
  clientForm: `${CDN}/ea809463-1886-4991-a0ae-7527423a9455.png`,
  demo: `${CDN}/4ac37c91-a09a-4ec7-bc03-4c91467944ae.png`,
  phoneTourner: `${CDN}/39160cb1-9c4b-4e96-a928-ee3e0bf8f702.jpg`,
};

const PROMPT = [
  "STRICT DESIGN LOCK — use ONLY the provided Restau Wheel product screenshots.",
  "Pure black background, hot pink #FF2D6A, yellow #F5C518, cyan #2EE6D6,",
  "bold white RESTAU WHEEL wordmark, Lucky Ticket with multicolor prize wheel,",
  "guest ENTRY TICKET form, phone UI with magenta TOURNER button.",
  "NO wooden casino wheel, NO bistro interior.",
  "",
  "STYLE: high-energy MOTION GRAPHICS / kinetic SaaS explainer, NOT a static slideshow.",
  "Fast whip pans, punch zooms, parallax UI plates, elastic scale pops, flash cuts,",
  "spinning wheel, QR snap-in, ticket flip, coin burst, typography that never sits still.",
  "Dense designed SFX: whooshes, hits, UI ticks, risers, bass hits synced to cuts.",
  "",
  "0-5s HOOK title slam + 'Une roue de fortune sur chaque table'.",
  "5-12s FLOW QR → ENTRY TICKET → TOURNER → wheel spin.",
  "12-20s VALUE prizes + return customers + control.",
  "20-26s PRICE '20 € / mois' kinetic slam.",
  "26-30s CTA 'Créer mon restaurant' + restauwheel.com.",
].join(" ");

type Result = {
  status?: string;
  video?: { url?: string };
  videos?: { url?: string }[];
};

async function main() {
  const outDir = path.join("artifacts", "restau-wheel-seedance-motion-30s");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("Submitting Seedance 2.5 omni_reference 30s via Higgsfield API…");
  const result = (await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      mode: "omni_reference",
      prompt: PROMPT,
      duration: 30,
      resolution: "1080p",
      aspect_ratio: "16:9",
      generate_audio: true,
      bitrate_mode: "high",
      image_references: [
        { type: "image_url", image_url: refs.landing },
        { type: "image_url", image_url: refs.clientForm },
        { type: "image_url", image_url: refs.phoneTourner },
        { type: "image_url", image_url: refs.demo },
      ],
    },
    withPolling: true,
  })) as Result;

  const status = String(result.status || "").toLowerCase();
  const url = result.video?.url || result.videos?.[0]?.url || null;
  const summary = { status, url, at: new Date().toISOString() };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  if (!url) {
    process.exit(1);
  }

  const dest = path.join(outDir, "restau-wheel-seedance-motion-30s.mp4");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log("Saved", dest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
