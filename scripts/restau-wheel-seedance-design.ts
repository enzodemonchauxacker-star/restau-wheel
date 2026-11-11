/**
 * Seedance 2.5 omni_reference ads locked to the real Restau Wheel design system:
 * black bg, pink/yellow/cyan accents, RESTAU WHEEL wordmark, Lucky Ticket, TOURNER phone promo.
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

/** Fresh chrome landing + client form + official phone promo (existing CDN) */
const refs = {
  landing: `${CDN}/a14c00f3-9035-4496-aaa3-ccbdd4548057.png`,
  clientForm: `${CDN}/ea809463-1886-4991-a0ae-7527423a9455.png`,
  demo: `${CDN}/4ac37c91-a09a-4ec7-bc03-4c91467944ae.png`,
  phoneTourner: `${CDN}/39160cb1-9c4b-4e96-a928-ee3e0bf8f702.jpg`,
};

const DESIGN_LOCK =
  "STRICT DESIGN LOCK — copy the provided Restau Wheel screenshots exactly. " +
  "Visual system: pure black background, hot pink and bright yellow CTAs, cyan accents, bold white sans-serif 'RESTAU WHEEL' wordmark. " +
  "Product motifs: white Lucky Ticket with pink shadow and multicolor prize wheel (pink/yellow/black/cyan), guest ENTRY TICKET form, phone UI with magenta TOURNER button. " +
  "Do NOT invent a wooden casino wheel, cream bistro interior, candlelight restaurant, or unrelated UI. Keep exact colors and layout from references.";

type Result = {
  status?: string;
  video?: { url?: string };
  videos?: { url?: string }[];
};

const ads = [
  {
    id: "design-landing-16x9",
    input: {
      mode: "omni_reference",
      prompt:
        `${DESIGN_LOCK} Cinematic 16:9 product ad. Animate the real Restau Wheel landing: black hero, headline 'Spin chance at the table.', pink 'Launch my restaurant' and yellow 'Try the demo' buttons, floating Lucky Ticket with Free dessert and the multicolor wheel. Soft camera push-in, subtle ticket parallax, pink/yellow glow. Photoreal UI motion, brand-faithful.`,
      duration: 6,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
      image_references: [
        { type: "image_url", image_url: refs.landing },
        { type: "image_url", image_url: refs.phoneTourner },
      ],
    },
  },
  {
    id: "design-social-9x16",
    input: {
      mode: "omni_reference",
      prompt:
        `${DESIGN_LOCK} Vertical 9:16 TikTok/Reels ad. Start on the official Restau Wheel phone promo: silver phone, digital multicolor wheel, magenta TOURNER button, floating gold coins on light gray studio. Then cut to the black Restau Wheel landing Lucky Ticket. Fast modern SaaS pacing. Exact product design only.`,
      duration: 5,
      resolution: "720p",
      aspect_ratio: "9:16",
      generate_audio: true,
      image_references: [
        { type: "image_url", image_url: refs.phoneTourner },
        { type: "image_url", image_url: refs.landing },
      ],
    },
  },
  {
    id: "design-funnel-16x9",
    input: {
      mode: "omni_reference",
      prompt:
        `${DESIGN_LOCK} 16:9 brand film montage of the real product flow: Restau Wheel black landing with Lucky Ticket → dark guest ENTRY TICKET form (gold accents, Go to the wheel) → phone with TOURNER spinning. Same Restau Wheel design system throughout. Soft transitions, premium SaaS commercial, no restaurant invent.`,
      duration: 8,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
      image_references: [
        { type: "image_url", image_url: refs.landing },
        { type: "image_url", image_url: refs.clientForm },
        { type: "image_url", image_url: refs.phoneTourner },
      ],
    },
  },
] as const;

const failed = new Set(["failed", "canceled", "cancelled", "moderated", "nsfw"]);

async function runOne(ad: (typeof ads)[number]) {
  console.log(`\n=== ${ad.id} ===`);
  const result = (await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: ad.input,
    withPolling: true,
  })) as Result;

  const status = String(result.status || "").toLowerCase();
  if (failed.has(status) || (status && status !== "completed" && status !== "success")) {
    console.error(`FAIL status=${status || "unknown"}`);
    console.error(JSON.stringify(result).slice(0, 600));
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
  const outDir = path.join("artifacts", "restau-wheel-seedance-design");
  fs.mkdirSync(outDir, { recursive: true });

  // Quick CDN reachability check
  for (const [name, url] of Object.entries(refs)) {
    const res = await fetch(url, { method: "HEAD" });
    console.log(`ref ${name}: ${res.status}`);
    if (!res.ok) throw new Error(`CDN ref ${name} not reachable (${res.status})`);
  }

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
