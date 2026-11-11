/**
 * Vertical Restau Wheel social ad from official promo frame + real landing.
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
const landing = `${CDN}/f8b2dc0b-6793-42e2-b267-e50e288140f3.png`;
const promoHero = `${CDN}/5fb613ff-6d1c-4268-9c2c-212717b41151.jpg`;

async function main() {
  const result = (await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      mode: "omni_reference",
      prompt:
        "Vertical 9:16 ad. Keep the exact Restau Wheel official promo look from the references: white smartphone showing the digital prize wheel and magenta TOURNER button, floating gold coins, clean studio gray background. Then briefly show the real Restau Wheel black landing with RESTAU WHEEL logo and Lucky Ticket. Do not invent a physical wooden casino wheel. Do not invent a restaurant interior.",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "9:16",
      generate_audio: true,
      image_references: [
        { type: "image_url", image_url: promoHero },
        { type: "image_url", image_url: landing },
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
    JSON.stringify({ id: "ad-real-social-9x16", status, url, refs: ["promoHero", "landing"] }, null, 2),
  );
  if (!url || !["completed", "success", ""].includes(status)) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
