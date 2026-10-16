/**
 * Retry Seedance 2.5 design ads: landing (start-frame fidelity) + funnel montage.
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
const landing = `${CDN}/a14c00f3-9035-4496-aaa3-ccbdd4548057.png`;
const clientForm = `${CDN}/ea809463-1886-4991-a0ae-7527423a9455.png`;
const phoneTourner = `${CDN}/39160cb1-9c4b-4e96-a928-ee3e0bf8f702.jpg`;

type Result = { status?: string; video?: { url?: string }; videos?: { url?: string }[]; request_id?: string };

async function run(id: string, input: Record<string, unknown>) {
  console.log(`\n=== ${id} ===`);
  // Submit without long subscribe timeout; poll ourselves up to ~10 min
  const queued = (await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input,
    withPolling: false,
  })) as Result & { status_url?: string; request_id?: string };

  const requestId = queued.request_id;
  if (!requestId) {
    console.error("No request_id", queued);
    return { id, ok: false as const, status: "no_request", url: null };
  }
  console.log("queued", requestId);

  const [keyId, keySecret] = credentials.split(":");
  const auth = `Key ${keyId}:${keySecret}`;
  const statusUrl = `https://platform.higgsfield.ai/requests/${requestId}/status`;
  const failed = new Set(["failed", "canceled", "cancelled", "moderated", "nsfw"]);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const res = await fetch(statusUrl, { headers: { Authorization: auth } });
    const j = (await res.json()) as Result;
    const status = String(j.status || "").toLowerCase();
    process.stdout.write(`  poll ${i + 1}: ${status}\n`);
    if (failed.has(status)) {
      console.error("FAIL", JSON.stringify(j).slice(0, 400));
      return { id, ok: false as const, status, url: null };
    }
    if (status === "completed" || status === "success") {
      const url = j.video?.url || j.videos?.[0]?.url || null;
      console.log("OK", url);
      return { id, ok: !!url, status, url };
    }
  }
  return { id, ok: false as const, status: "timeout", url: null };
}

async function main() {
  const results = [];

  results.push(
    await run("design-landing-strict-16x9", {
      mode: "omni_reference",
      prompt:
        "Animate ONLY this exact Restau Wheel landing screenshot. Keep the black background, RESTAU WHEEL white wordmark top-left, yellow Get started, pink Launch my restaurant and yellow Try the demo buttons, headline Spin chance at the table, and the white Lucky Ticket with Free dessert and multicolor pink/yellow/cyan/black wheel. Subtle camera push and soft glow. Do not change brand spelling. Do not invent new UI.",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
      image_references: [{ type: "image_url", image_url: landing }],
    }),
  );

  results.push(
    await run("design-funnel-16x9", {
      mode: "omni_reference",
      prompt:
        "Product funnel ad for Restau Wheel using ONLY these screenshots in order: 1) black landing with Lucky Ticket 2) dark guest ENTRY TICKET form with gold fields and yellow Go to the wheel 3) phone with multicolor wheel and magenta TOURNER. Exact Restau Wheel design (black, pink, yellow, cyan). No restaurant invent, no wooden wheel.",
      duration: 6,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
      image_references: [
        { type: "image_url", image_url: landing },
        { type: "image_url", image_url: clientForm },
        { type: "image_url", image_url: phoneTourner },
      ],
    }),
  );

  fs.mkdirSync("artifacts/restau-wheel-seedance-design", { recursive: true });
  fs.writeFileSync(
    "artifacts/restau-wheel-seedance-design/retry-summary.json",
    JSON.stringify(results, null, 2),
  );
  console.log("\nDone", results);
  if (!results.some((r) => r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
