/**
 * Retry vertical Restau Wheel social ad with real promo + client UI refs.
 */
import { config as loadEnv } from "dotenv";
import { config, higgsfield } from "@higgsfield/client/v2";
import fs from "node:fs";

loadEnv({ path: ".env.local", override: true });
const credentials = process.env.HF_CREDENTIALS;
if (!credentials?.includes(":")) {
  console.error("Missing HF_CREDENTIALS");
  process.exit(1);
}
config({ credentials });

const CDN = "https://d2ol7oe51mr4n9.cloudfront.net/user_3FtfBHx3ODuHtkhLTPM9V4BijnV";
const promoHero = `${CDN}/5fb613ff-6d1c-4268-9c2c-212717b41151.jpg`;
const client = `${CDN}/7c692315-80dc-4122-aa90-97973b18b0f8.png`;

async function main() {
  const result = (await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      mode: "omni_reference",
      prompt:
        "Vertical 9:16 social ad for Restau Wheel using ONLY the provided real product images. Show the colorful Restau Wheel prize wheel UI spinning on a phone screen. Exact brand logo and colors. Fast TikTok pacing. No invented restaurant or bistro scene.",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "9:16",
      generate_audio: true,
      image_references: [
        { type: "image_url", image_url: promoHero },
        { type: "image_url", image_url: client },
      ],
    },
    withPolling: true,
  })) as { status?: string; video?: { url?: string }; videos?: { url?: string }[] };

  const status = String(result.status || "").toLowerCase();
  const url = result.video?.url || result.videos?.[0]?.url || null;
  console.log("status", status);
  console.log("video_url", url || "NONE");
  fs.mkdirSync("artifacts/restau-wheel-ads-real", { recursive: true });
  fs.writeFileSync(
    "artifacts/restau-wheel-ads-real/ad-real-social-9x16.json",
    JSON.stringify({ id: "ad-real-social-9x16", status, url }, null, 2),
  );
  if (!url || !["completed", "success", ""].includes(status)) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
