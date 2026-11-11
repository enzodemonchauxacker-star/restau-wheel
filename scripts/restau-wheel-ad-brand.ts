import { config as loadEnv } from "dotenv";
import { config, higgsfield } from "@higgsfield/client/v2";
import fs from "node:fs";

loadEnv({ path: ".env.local", override: true });
config({ credentials: process.env.HF_CREDENTIALS });

async function main() {
  const result = await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      prompt:
        "Premium brand film for Restau Wheel SaaS. Montage: restaurant owner smiles behind the bar, QR stand on tables, guests spinning a fortune wheel on phones, return visit with a free drink. Warm cinematic color grade, French hospitality, photoreal commercial.",
      duration: 8,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
    },
    withPolling: true,
  });
  const status = String((result as { status?: string }).status || "").toLowerCase();
  const url =
    (result as { video?: { url?: string } }).video?.url ||
    (result as { videos?: { url?: string }[] }).videos?.[0]?.url;
  console.log("status", status);
  console.log("video_url", url || "NONE");
  if (!url || (status && !["completed", "success", ""].includes(status))) process.exit(1);
  fs.writeFileSync(
    "artifacts/restau-wheel-ads/ad-brand-montage.json",
    JSON.stringify({ id: "ad-brand-montage-16x9", status, url }, null, 2),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
