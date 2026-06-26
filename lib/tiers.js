// GPU/job tiers keep fair fights: small jobs only compete among small GPUs, etc.
//
// IMPORTANT: tiers are decided by US (the platform), never chosen by providers.
// A provider reports its GPU; we map that GPU to a tier using the catalog below
// (curated) with a VRAM-based fallback for anything we don't recognize.

export const TIERS = {
  1: { name: "Light", label: "Tier 1 - Light (small models, quick inference)" },
  2: { name: "Standard", label: "Tier 2 - Standard (medium models)" },
  3: { name: "Heavy", label: "Tier 3 - Heavy (large models / training)" },
};

// Curated catalog: GPU model -> { vramGb, tier }. This is the source of truth
// we control. Add GPUs here as you certify them.
export const GPU_CATALOG = {
  "RTX 3060": { vramGb: 12, tier: 1 },
  "RTX 3070": { vramGb: 8, tier: 1 },
  "RTX 3080": { vramGb: 10, tier: 1 },
  "RTX 4060": { vramGb: 8, tier: 1 },
  "RTX 2060 SUPER": { vramGb: 8, tier: 1 },
  "RTX 2060": { vramGb: 6, tier: 1 },
  "RTX 2070 SUPER": { vramGb: 8, tier: 1 },
  "RTX 2070": { vramGb: 8, tier: 1 },
  "RTX 4070": { vramGb: 12, tier: 2 },
  "RTX 4080": { vramGb: 16, tier: 2 },
  "RTX 3090": { vramGb: 24, tier: 2 },
  "L4": { vramGb: 24, tier: 2 },
  "RTX 4090": { vramGb: 24, tier: 3 },
  "RTX 5060": { vramGb: 8, tier: 1 },
  "RTX 5070 Ti": { vramGb: 16, tier: 2 },
  "RTX 5070": { vramGb: 12, tier: 2 },
  "RTX 5080": { vramGb: 16, tier: 2 },
  "RTX 5090": { vramGb: 32, tier: 3 },
  "A100 40GB": { vramGb: 40, tier: 3 },
  "A100 80GB": { vramGb: 80, tier: 3 },
  "H100": { vramGb: 80, tier: 3 },

  // --- AMD (Radeon / Pro / Instinct) ---
  "RX 6600": { vramGb: 8, tier: 1 },
  "RX 6650 XT": { vramGb: 8, tier: 1 },
  "RX 7600": { vramGb: 8, tier: 1 },
  "RX 6700 XT": { vramGb: 12, tier: 2 },
  "RX 7700 XT": { vramGb: 12, tier: 2 },
  "RX 6800": { vramGb: 16, tier: 2 },
  "RX 6800 XT": { vramGb: 16, tier: 2 },
  "RX 6900 XT": { vramGb: 16, tier: 2 },
  "RX 7800 XT": { vramGb: 16, tier: 2 },
  "RX 7900 XT": { vramGb: 20, tier: 2 },
  "RX 7900 XTX": { vramGb: 24, tier: 3 },
  "Radeon Pro W7900": { vramGb: 48, tier: 3 },
  "Instinct MI210": { vramGb: 64, tier: 3 },
  "Instinct MI300": { vramGb: 192, tier: 3 },

  // --- Intel (Arc / Data Center) ---
  "Arc A380": { vramGb: 6, tier: 1 },
  "Arc A580": { vramGb: 8, tier: 1 },
  "Arc A750": { vramGb: 8, tier: 1 },
  "Arc B570": { vramGb: 10, tier: 1 },
  "Arc B580": { vramGb: 12, tier: 2 },
  "Arc A770": { vramGb: 16, tier: 2 },
  "Data Center GPU Max 1100": { vramGb: 48, tier: 3 },

  // --- Apple Silicon (unified memory; tiered by usable RAM) ---
  "Apple M1": { vramGb: 8, tier: 1 },
  "Apple M2": { vramGb: 8, tier: 1 },
  "Apple M3": { vramGb: 8, tier: 1 },
  "Apple M1 Pro": { vramGb: 16, tier: 2 },
  "Apple M2 Pro": { vramGb: 16, tier: 2 },
  "Apple M3 Pro": { vramGb: 18, tier: 2 },
  "Apple M1 Max": { vramGb: 32, tier: 3 },
  "Apple M2 Max": { vramGb: 32, tier: 3 },
  "Apple M3 Max": { vramGb: 36, tier: 3 },
  "Apple M1 Ultra": { vramGb: 64, tier: 3 },
  "Apple M2 Ultra": { vramGb: 64, tier: 3 },
};

// Curated workload catalog: a job's tier comes from WHAT it asks for, not from
// what the poster claims. We control this mapping.
export const WORKLOAD_CATALOG = {
  "text-small": { label: "Text gen - small (7B LLM)", tier: 1 },
  "text-medium": { label: "Text gen - medium (13B LLM)", tier: 2 },
  "text-large": { label: "Text gen - large (70B LLM)", tier: 3 },
};

export function tierName(tier) {
  return TIERS[tier]?.name ?? "Unknown";
}

// Decide a job's tier from its workload type. Poster-supplied tier is ignored.
export function assignJobTier(workload) {
  const known = workload && WORKLOAD_CATALOG[workload];
  return known ? known.tier : 1;
}

// Decide a tier from a reported GPU. Catalog wins; otherwise fall back to VRAM.
export function assignTier({ gpuModel, vramGb }) {
  const known = gpuModel && GPU_CATALOG[gpuModel];
  if (known) return { tier: known.tier, vramGb: known.vramGb, source: "catalog" };

  const v = Number(vramGb) || 0;
  let tier = 1;
  if (v >= 24) tier = 3;
  else if (v >= 12) tier = 2;
  return { tier, vramGb: v, source: "vram" };
}

// Normalize vendor names so catalog matching ignores (R)/(TM) marks, the
// "Graphics" suffix, and inconsistent spacing across NVIDIA/AMD/Intel/Apple.
function normalizeGpuName(name) {
  return String(name)
    .toUpperCase()
    .replace(/\(R\)|\(TM\)/g, " ")
    .replace(/\bGRAPHICS\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Match a detected GPU name to a catalog key (longest match first).
export function matchGpuCatalog(rawName) {
  if (!rawName) return null;
  const norm = normalizeGpuName(rawName);
  const keys = Object.keys(GPU_CATALOG).sort((a, b) => b.length - a.length);
  return keys.find((key) => norm.includes(normalizeGpuName(key))) || null;
}

// Server-side source of truth: tier comes from raw GPU name + VRAM, never from
// a client-supplied model string (prevents --gpu spoofing).
export function resolveGpuTier({ gpuRawName, vramGb }) {
  const matched = matchGpuCatalog(gpuRawName);
  if (matched) {
    const entry = GPU_CATALOG[matched];
    const detectedVram = Number(vramGb) || 0;
    return {
      gpuModel: matched,
      gpuRawName: gpuRawName || null,
      vramGb: detectedVram || entry.vramGb,
      tier: entry.tier,
      tierSource: "catalog",
    };
  }

  const assigned = assignTier({ gpuModel: null, vramGb });
  const label =
    gpuRawName
      ?.replace(/^(NVIDIA|AMD|Intel\(R\)|Intel)\s+/i, "")
      .replace(/\(R\)|\(TM\)/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "Unknown GPU";
  return {
    gpuModel: label,
    gpuRawName: gpuRawName || null,
    vramGb: assigned.vramGb,
    tier: assigned.tier,
    tierSource: assigned.source,
  };
}

// A provider can enter a job only if its (system-assigned) tier matches.
export function isEligible(provider, job) {
  return provider.tier === job.tier;
}
