/**
 * Generate Restau Wheel advertising videos via Seedance 2.5 (HF_CREDENTIALS).
 * Credentials from .env.local only — never logged.
 */
import { config as loadEnv } from "dotenv";
import { config, higgsfield } from "@higgsfield/client/v2";
import fs from "node:fs";
import path from "node:path";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const credentials = process.env.HF_CREDENTIALS;
if (!credentials?.includes(":")) {
  console.error("Missing HF_CREDENTIALS in .env.local");
  process.exit(1);
}
config({ credentials });

type Result = {
  status?: string;
  video?: { url?: string };
  videos?: { url?: string }[];
};

const ads = [
  {
    id: "ad-cinematic-16x9",
    input: {
      prompt:
        "Cinematic advertising commercial for Restau Wheel, a French restaurant loyalty app. Warm evening bistro interior, candlelight and brass accents. Guests at a table scan a QR code on a printed card. A premium fortune wheel spins on a smartphone screen and lands on a free dessert prize. Soft golden lighting, shallow depth of field, elegant French restaurant atmosphere, brand name Restau Wheel subtly visible on the phone UI, photoreal, no gibberish text.",
      duration: 8,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
    },
  },
  {
    id: "ad-social-9x16",
    input: {
      prompt:
        "Vertical social media ad for Restau Wheel. Fast hook: a phone scans a QR on a restaurant table, then a colorful fortune wheel spins and stops on a glowing prize. Young diners smile, dessert arrives. Bold modern restaurant vibe, high energy TikTok Reels style, clear Restau Wheel product feel, photoreal, readable phone screen without gibberish.",
      duration: 8,
      resolution: "720p",
      aspect_ratio: "9:16",
      generate_audio: true,
    },
  },
  {
    id: "ad-brand-montage-16x9",
    input: {
      prompt:
        "Premium brand film for Restau Wheel SaaS. Montage: restaurant owner smiles behind the bar, QR stand on tables, guests spinning a fortune wheel on phones, return visit with a free drink. Warm cinematic color grade, French hospitality, confidence and loyalty, subtle Restau Wheel end card, photoreal commercial.",
      duration: 10,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
    },
  },
] as const;

const failed = new Set(["failed", "canceled", "cancelled", "moderated"]);

async function runOne(ad: (typeof ads)[number]) {
  console.log(`\n=== ${ad.id} ===`);
  const result = (await higgsfield.subscribe(
    "bytedance/seedance-2.5/text-to-video",
    { input: ad.input, withPolling: true },
  )) as Result;

  const status = String(result.status || "").toLowerCase();
  if (failed.has(status) || (status && status !== "completed" && status !== "success")) {
    console.error(`FAIL status=${status || "unknown"}`);
    return { id: ad.id, ok: false as const, status, url: null };
  }
  const url = result.video?.url || result.videos?.[0]?.url || null;
  if (!url) {
    console.error("FAIL missing video url");
    return { id: ad.id, ok: false as const, status, url: null };
  }
  console.log("OK", url);
  return { id: ad.id, ok: true as const, status: status || "completed", url };
}

async function main() {
  const outDir = path.join("artifacts", "restau-wheel-ads");
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  for (const ad of ads) {
    results.push(await runOne(ad));
  }

  const summaryPath = path.join(outDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log("\nSummary written to", summaryPath);

  const ok = results.filter((r) => r.ok);
  if (!ok.length) {
    console.error("No videos succeeded.");
    process.exit(1);
  }
  console.log(`\n${ok.length}/${results.length} videos ready:`);
  for (const r of ok) console.log(`- ${r.id}: ${r.url}`);
}

main().catch((err) => {
  console.error("Request error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
