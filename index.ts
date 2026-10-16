/**
 * Higgsfield Seedance 2.5 — text-to-video example (server-side only).
 * Credentials: HF_CREDENTIALS in .env.local (never commit).
 */
import { config as loadEnv } from "dotenv";
import { config, higgsfield } from "@higgsfield/client/v2";

// Prefer .env.local (gitignored); also load .env without overriding
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const credentials = process.env.HF_CREDENTIALS;
if (!credentials || !credentials.includes(":")) {
  console.error(
    "Missing HF_CREDENTIALS. Add key-id:key-secret to .env.local (or the environment) and retry.",
  );
  process.exit(1);
}

config({ credentials });

type SubscribeResult = {
  status?: string;
  video?: { url?: string };
  videos?: { url?: string }[];
  output?: { url?: string };
};

async function main() {
  console.log("Submitting bytedance/seedance-2.5/text-to-video …");

  const result = (await higgsfield.subscribe(
    "bytedance/seedance-2.5/text-to-video",
    {
      input: {
        prompt: "A cinematic scene at sunset",
        duration: 5,
        resolution: "720p",
        aspect_ratio: "16:9",
      },
      withPolling: true,
    },
  )) as SubscribeResult;

  const status = String(result.status || "").toLowerCase();
  const failed = new Set(["failed", "canceled", "cancelled", "moderated"]);

  if (failed.has(status)) {
    console.error(`Generation did not succeed (status=${status}).`);
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (status && status !== "completed" && status !== "success") {
    console.error(`Unexpected status=${status}; not treating as success.`);
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const videoUrl =
    result.video?.url || result.videos?.[0]?.url || result.output?.url;

  if (!videoUrl) {
    console.error("Completed response missing video URL.");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log("status:", status || "completed");
  console.log("video_url:", videoUrl);
}

main().catch((err) => {
  console.error("Request error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
