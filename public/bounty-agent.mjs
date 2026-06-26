#!/usr/bin/env node
/**
 * Bounty Compute - Provider Agent
 *
 * Run this on a machine with a GPU to join the network and earn QST.
 * It detects your GPU (NVIDIA, AMD, Intel, or Apple Silicon), registers (the
 * SERVER assigns your tier), then polls for matching jobs, runs the work, and
 * submits the result.
 *
 * It does REAL inference:
 *   - text-* workloads -> Ollama (http://localhost:11434)
 * If Ollama isn't reachable, the agent skips that job (it never submits fake
 * work).
 *
 * Usage:
 *   node agent/bounty-agent.mjs --name my-rig --wallet <solana-address>
 *
 * Options:
 *   --name    machine name (required)
 *   --wallet  Solana address that receives QST (required for real payouts)
 *   --server  backend URL (default http://localhost:3000)
 *   --ollama  Ollama base URL (default http://localhost:11434)
 *   --model   override the Ollama model for text jobs
 *   --gpu     override the detected GPU name (when auto-detect fails)
 *   --vram    override detected VRAM in GB (sets your tier; use if undetected)
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
const POLL = Number(args.poll) || 3000;
const NAME = args.name;
const WALLET = args.wallet || "";

// Default Ollama model per text tier. Override with --model.
const TEXT_MODELS = {
  "text-small": "llama3.2:1b",
  "text-medium": "llama3.1:8b",
  "text-large": "llama3.1:70b",
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

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString();
}

// NVIDIA via nvidia-smi.
function detectNvidia() {
  try {
    const out = sh(
      "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits"
    )
      .trim()
      .split("\n")[0];
    const [rawName, mb] = out.split(",").map((s) => s.trim());
    if (!rawName) return null;
    return { rawName, vram: Math.round(Number(mb) / 1024) };
  } catch {
    return null;
  }
}

// AMD via rocm-smi (Linux, ROCm installed).
function detectAmd() {
  try {
    const name = sh("rocm-smi --showproductname")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /card series|product name|gpu\[/i.test(l) && l.includes(":"));
    const memOut = sh("rocm-smi --showmeminfo vram");
    const memLine = memOut
      .split("\n")
      .find((l) => /total/i.test(l) && /\d/.test(l));
    let vram = 0;
    if (memLine) {
      const m = memLine.match(/(\d+)/g);
      if (m) vram = Math.round(Number(m[m.length - 1]) / 1024 ** 3);
    }
    const rawName = name
      ? name.split(":").pop().trim()
      : "AMD Radeon GPU";
    if (!rawName) return null;
    return { rawName: `AMD ${rawName}`.replace(/AMD\s+AMD/i, "AMD"), vram };
  } catch {
    return null;
  }
}

// Cross-platform fallback: enumerate the display adapter from the OS.
// Works for any vendor (Intel/AMD/NVIDIA/Apple) but VRAM may be approximate.
function detectGeneric() {
  try {
    if (process.platform === "win32") {
      // Name from WMI; VRAM from the registry (AdapterRAM is capped at 4GB).
      const name = sh(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController | Select-Object -First 1).Name"'
      ).trim();
      let vram = 0;
      try {
        const qw = sh(
          'powershell -NoProfile -Command "(Get-ItemProperty \'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0000\' -Name HardwareInformation.qwMemorySize).\'HardwareInformation.qwMemorySize\'"'
        ).trim();
        if (qw) vram = Math.round(Number(qw) / 1024 ** 3);
      } catch {}
      if (!name) return null;
      return { rawName: name, vram };
    }
    if (process.platform === "darwin") {
      const out = sh("system_profiler SPDisplaysDataType");
      const name = (out.match(/Chipset Model:\s*(.+)/) || [])[1]?.trim();
      const vramStr = (out.match(/VRAM.*?:\s*(\d+)\s*(MB|GB)/i) || []);
      let vram = 0;
      if (vramStr[1]) {
        vram = Number(vramStr[1]);
        if (/MB/i.test(vramStr[2])) vram = Math.round(vram / 1024);
      }
      // Apple Silicon reports no discrete VRAM; approximate from unified RAM.
      if (!vram) {
        try {
          const mem = sh("sysctl -n hw.memsize").trim();
          if (mem) vram = Math.round((Number(mem) / 1024 ** 3) * 0.66);
        } catch {}
      }
      if (!name) return null;
      return { rawName: name, vram };
    }
    // Linux: lspci for the name (no reliable VRAM without vendor tools).
    const out = sh("lspci");
    const line = out
      .split("\n")
      .find((l) => /VGA compatible controller|3D controller/i.test(l));
    const rawName = line ? line.split(":").slice(2).join(":").trim() : null;
    if (!rawName) return null;
    return { rawName, vram: 0 };
  } catch {
    return null;
  }
}

// Detect the local GPU across vendors. Returns { rawName, vram } or null.
// A manual --vram override always wins (useful when auto-detection can't read it).
function detectGpu() {
  const vramOverride = Number(args.vram) || 0;
  const detected =
    detectNvidia() || detectAmd() || detectGeneric() || null;
  if (!detected) {
    return vramOverride ? { rawName: args.gpu || "Unknown GPU", vram: vramOverride } : null;
  }
  if (vramOverride) detected.vram = vramOverride;
  return detected;
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

// Route a job to the right runtime and produce a verifiable result.
// Returns null if this machine can't serve the job (runtime missing) so we
// never submit fake work.
async function runWorkload(job) {
  const start = Date.now();
  const kind = String(job.workload).split("-")[0]; // text

  let output = null;
  if (kind === "text") output = await runText(job);
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
  const detected = detectGpu();
  if (!detected) {
    console.error(
      "Error: could not detect a GPU. Tried nvidia-smi, rocm-smi, and OS enumeration.\n" +
        "Pass it manually, e.g.: --gpu \"Radeon RX 7900 XTX\" --vram 24"
    );
    process.exit(1);
  }
  if (!detected.vram) {
    log(
      "Warning: couldn't read VRAM automatically — tier will be estimated. " +
        "For accuracy pass --vram <GB>."
    );
  }

  log(`Detected GPU: ${detected.rawName} (${detected.vram}GB)`);

  const reg = await api("/api/providers", {
    method: "POST",
    body: JSON.stringify({
      name: NAME,
      gpuRawName: detected.rawName,
      vramGb: detected.vram,
      wallet: WALLET,
    }),
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
