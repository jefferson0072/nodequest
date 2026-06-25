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
  "RTX 4070": { vramGb: 12, tier: 2 },
  "RTX 4080": { vramGb: 16, tier: 2 },
  "RTX 3090": { vramGb: 24, tier: 2 },
  "L4": { vramGb: 24, tier: 2 },
  "RTX 4090": { vramGb: 24, tier: 3 },
  "A100 40GB": { vramGb: 40, tier: 3 },
  "A100 80GB": { vramGb: 80, tier: 3 },
  "H100": { vramGb: 80, tier: 3 },
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

// A provider can enter a job only if its (system-assigned) tier matches.
export function isEligible(provider, job) {
  return provider.tier === job.tier;
}
