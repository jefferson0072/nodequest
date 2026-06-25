#!/usr/bin/env node
/**
 * Bounty Compute - Provider Agent
 *
 * Run this on a machine with a GPU to join the network and earn QST.
 * It detects your GPU, registers (the SERVER assigns your tier), then polls for
 * matching jobs, runs the work, and submits the result.
 *
 * It does REAL inference:
 *   - text-*  workloads  -> Ollama          (http://localhost:11434)
 *   - image-* workloads  -> Stable Diffusion (AUTOMATIC1111 API, :7860)
 * If the required runtime isn't reachable, the agent skips that job (it never
 * submits fake work).
 *
 * Usage:
 *   node agent/bounty-agent.mjs --name my-rig --wallet <solana-address>
 *   node agent/bounty-agent.mjs --name my-rig --gpu "RTX 3060" --wallet <addr>
 *
 * Options:
 *   --name    machine name (required)
 *   --wallet  Solana address that receives QST (required for real payouts)
 *   --gpu     GPU model to report (must match the platform catalog); optional
 *   --vram    VRAM in GB, used if the GPU isn't in the catalog; optional
 *   --server  backend URL (default http://localhost:3000)
 *   --ollama  Ollama base URL (default http://localhost:11434)
 *   --sd      Stable Diffusion API base URL (default http://localhost:7860)
 *   --model   override the Ollama model for text jobs
 *   --poll    poll interval ms (default 3000)
 */

import crypto from "node:crypto";
import { execSync } from "node:child_process";

// ---------- args ----------
function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      a[key] = val;
    }
  }
  return a;
}
const args = parseArgs(process.argv);
const SERVER = args.server || "http://localhost:3000";
const OLLAMA = args.ollama || "http://localhost:11434";
const SD = args.sd || "http://localhost:7860";
const POLL = Number(args.poll) || 3000;
const NAME = args.name;
const WALLET = args.wallet || "";

// Default Ollama model per text tier. Override with --model.
const TEXT_MODELS = {
  "text-small": "llama3.2:1b",
  "text-medium": "llama3.1:8b",
  "text-large": "llama3.1:70b",
};
// Image dimensions per image workload.
const IMAGE_DIMS = {
  "image-512": { width: 512, height: 512 },
  "image-sdxl": { width: 1024, height: 1024 },
};

if (!NAME) {
  console.error("Error: --name is required");
  process.exit(1);
}

// ---------- helpers ----------
const log = (...m) => console.log(`[${new Date().toLocaleTimeString()}]`, ...m);

async function api(path, opts) {
  const res = await fetch(SERVER + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text };
  }
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// Try to detect the local NVIDIA GPU. Returns { rawName, vram } or null.
function detectGpu() {
  try {
    const out = execSync(
      "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits",
      { stdio: ["ignore", "pipe", "ignore"] }
    )
      .toString()
      .trim()
      .split("\n")[0];
    const [rawName, mb] = out.split(",").map((s) => s.trim());
    return { rawName, vram: Math.round(Number(mb) / 1024) };
  } catch {
    return null;
  }
}

// Map a detected GPU name to a platform catalog key (e.g. "RTX 3060").
function matchCatalog(rawName, catalog) {
  if (!rawName) return null;
  const keys = Object.keys(catalog || {});
  return keys.find((k) => rawName.toUpperCase().includes(k.toUpperCase())) || null;
}

function hashOf(text) {
  return "0x" + crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
}

// Real text inference via Ollama. Deterministic options (temp 0 + fixed seed)
// give honest providers the best chance of matching outputs for consensus.
async function runText(job) {
  const model = args.model || TEXT_MODELS[job.workload] || "llama3.2";
  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: String(job.input),
        stream: false,
        options: { temperature: 0, seed: 42 },
      }),
    });
    if (!res.ok) {
      log(`Ollama error ${res.status} (model ${model}). Run: ollama pull ${model}`);
      return null;
    }
    const data = await res.json();
    const text = (data.response || "").trim();
    return text || null;
  } catch (e) {
    log(`Ollama unreachable at ${OLLAMA} (${e.message}). Install it from ollama.com.`);
    return null;
  }
}

// Real image inference via the AUTOMATIC1111 Stable Diffusion API.
// Returns a content hash of the produced image (image bytes themselves need
// object storage to deliver to the poster — see README).
async function runImage(job) {
  const dims = IMAGE_DIMS[job.workload] || { width: 512, height: 512 };
  try {
    const res = await fetch(`${SD}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: String(job.input),
        steps: 20,
        seed: 42,
        cfg_scale: 7,
        ...dims,
      }),
    });
    if (!res.ok) {
      log(`Stable Diffusion error ${res.status} at ${SD}`);
      return null;
    }
    const data = await res.json();
    const img = data.images && data.images[0];
    if (!img) return null;
    return "image:" + crypto.createHash("sha256").update(img).digest("hex");
  } catch (e) {
    log(`Stable Diffusion unreachable at ${SD} (${e.message}).`);
    return null;
  }
}

// Route a job to the right runtime and produce a verifiable result.
// Returns null if this machine can't serve the job (runtime missing) so we
// never submit fake work.
async function runWorkload(job) {
  const start = Date.now();
  const kind = String(job.workload).split("-")[0]; // text | image | video

  let output = null;
  if (kind === "text") output = await runText(job);
  else if (kind === "image") output = await runImage(job);
  else {
    log(`Workload "${job.workload}" not supported by this agent yet — skipping.`);
    return null;
  }

  if (!output) return null;
  return { output, resultHash: hashOf(output), elapsedMs: Date.now() - start };
}

// ---------- main ----------
let provider = null;
const done = new Set();
const skipped = new Set();

async function register() {
  const { catalog } = await api("/api/providers");
  let gpuModel = args.gpu || null;
  let vramGb = args.vram ? Number(args.vram) : undefined;

  if (!gpuModel) {
    const detected = detectGpu();
    if (detected) {
      gpuModel = matchCatalog(detected.rawName, catalog);
      vramGb = vramGb ?? detected.vram;
      log(`Detected GPU: ${detected.rawName} (${detected.vram}GB)`);
    } else {
      log("No NVIDIA GPU detected (nvidia-smi unavailable).");
    }
  }

  const reg = await api("/api/providers", {
    method: "POST",
    body: JSON.stringify({ name: NAME, gpuModel, vramGb, wallet: WALLET }),
  });
  provider = reg.provider;
  log(
    `Registered "${provider.name}" -> GPU ${provider.gpuModel} (${provider.vramGb}GB), ` +
      `SERVER-assigned Tier ${provider.tier}. Wallet: ${provider.wallet}`
  );
}

async function tick() {
  try {
    const { jobs } = await api(
      `/api/jobs/claimable?tier=${provider.tier}&providerId=${provider.id}`
    );
    for (const job of jobs) {
      if (done.has(job.id) || skipped.has(job.id)) continue;
      log(`Job ${job.id} "${job.title}" (${job.reward} QST) - running...`);
      const result = await runWorkload(job);
      if (!result) {
        // Couldn't compute (runtime missing/unsupported). Don't submit fake work.
        skipped.add(job.id);
        continue;
      }
      done.add(job.id);
      await api(`/api/jobs/${job.id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          providerId: provider.id,
          resultHash: result.resultHash,
          output: result.output,
          elapsedMs: result.elapsedMs,
        }),
      });
      log(`Submitted ${job.id} in ${result.elapsedMs}ms (hash ${result.resultHash})`);
    }
  } catch (e) {
    log("poll error:", e.message);
  }
}

async function main() {
  log(`Connecting to ${SERVER} ...`);
  await register();
  log(`Polling for Tier ${provider.tier} jobs every ${POLL}ms. Ctrl+C to stop.`);
  await tick();
  setInterval(tick, POLL);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
