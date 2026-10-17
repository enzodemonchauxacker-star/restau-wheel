/**
 * Generate Restau Wheel ads from REAL product visuals (UI + promo frames),
 * via Seedance 2.5 omni_reference. Credentials from .env.local only.
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

const CDN = "https://d2ol7oe51mr4n9.cloudfront.net/user_3FtfBHx3ODuHtkhLTPM9V4BijnV";

const refs = {
  landing: `${CDN}/f8b2dc0b-6793-42e2-b267-e50e288140f3.png`,
  client: `${CDN}/7c692315-80dc-4122-aa90-97973b18b0f8.png`,
  promoHero: `${CDN}/5fb613ff-6d1c-4268-9c2c-212717b41151.jpg`,
  promoV15: `${CDN}/d6daa681-f1ed-4ef3-90e9-63889e255a1b.jpg`,
};

type Result = {
  status?: string;
  video?: { url?: string };
  videos?: { url?: string }[];
};

const ads = [
  {
    id: "ad-real-ui-16x9",
    input: {
      mode: "omni_reference",
      prompt:
        "Product ad for Restau Wheel using ONLY the provided real screenshots as visual source. Show the Restau Wheel landing page and the colorful prize wheel UI on phone/tablet. Subtle camera push-in and light motion on the UI. Keep exact brand colors, logo, and interface. No invented restaurant scene, no fake bistro, no people eating. Clean SaaS product demo, photoreal screen recording feel, French product Restau Wheel.",
      duration: 6,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
      image_references: [
        { type: "image_url", image_url: refs.landing },
        { type: "image_url", image_url: refs.client },
      ],
    },
  },
  {
    id: "ad-real-social-9x16",
    input: {
      mode: "omni_reference",
      prompt:
        "Vertical social ad for Restau Wheel using ONLY the provided real product visuals. Start on the Restau Wheel promo wheel frame, then cut to the real client prize-wheel UI spinning. Keep exact Restau Wheel branding and UI. TikTok/Reels pacing, no invented restaurant interiors, no fake food scenes.",
      duration: 6,
      resolution: "720p",
      aspect_ratio: "9:16",
      generate_audio: true,
      image_references: [
        { type: "image_url", image_url: refs.promoHero },
        { type: "image_url", image_url: refs.client },
        { type: "image_url", image_url: refs.promoV15 },
      ],
    },
  },
  {
    id: "ad-real-brand-16x9",
    input: {
      mode: "omni_reference",
      prompt:
        "Premium brand film for Restau Wheel SaaS built strictly from the real product screenshots provided. Montage of the real landing page, QR/card visual language, and the prize wheel client UI. Soft parallax and UI glow only. Exact Restau Wheel brand identity. No invented bistro, no stock restaurant footage.",
      duration: 8,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
      image_references: [
        { type: "image_url", image_url: refs.landing },
        { type: "image_url", image_url: refs.client },
        { type: "image_url", image_url: refs.promoHero },
      ],
    },
  },
] as const;

const failed = new Set(["failed", "canceled", "cancelled", "moderated", "nsfw"]);

async function runOne(ad: (typeof ads)[number]) {
  console.log(`\n=== ${ad.id} ===`);
  const result = (await higgsfield.subscribe(
    "bytedance/seedance-2.5/text-to-video",
    { input: ad.input, withPolling: true },
  )) as Result;

  const status = String(result.status || "").toLowerCase();
  if (failed.has(status) || (status && status !== "completed" && status !== "success")) {
    console.error(`FAIL status=${status || "unknown"}`);
    console.error(JSON.stringify(result).slice(0, 500));
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
  const outDir = path.join("artifacts", "restau-wheel-ads-real");
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  for (const ad of ads) {
    results.push(await runOne(ad));
  }

  const summaryPath = path.join(outDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({ refs, results }, null, 2));
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
