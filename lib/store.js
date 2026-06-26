// Persistent store backed by Upstash Redis.
//
// All functions are async. When UPSTASH_REDIS_REST_URL / _TOKEN are set (prod
// and your local .env.local), data is stored in Upstash and survives restarts
// and serverless cold starts. If they are NOT set, we fall back to an in-memory
// store so local dev still runs — that fallback is for development only and is
// NOT used in production.

import { resolveGpuTier } from "./tiers";

// ---------- KV abstraction (Upstash or in-memory dev fallback) ----------

const HAS_UPSTASH = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

function makeMemoryKv() {
  const g = globalThis;
  if (!g.__NQ_MEM__) g.__NQ_MEM__ = { map: new Map(), lists: new Map() };
  const { map, lists } = g.__NQ_MEM__;
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async set(key, val) {
      map.set(key, val);
    },
    async del(key) {
      map.delete(key);
    },
    async incr(key) {
      const n = (Number(map.get(key)) || 0) + 1;
      map.set(key, n);
      return n;
    },
    async incrbyfloat(key, by) {
      const n = (Number(map.get(key)) || 0) + Number(by);
      map.set(key, n);
      return n;
    },
    async lpush(key, val) {
      const arr = lists.get(key) || [];
      arr.unshift(val);
      lists.set(key, arr);
    },
    async lrange(key) {
      return lists.get(key) || [];
    },
    async mget(keys) {
      return keys.map((k) => (map.has(k) ? map.get(k) : null));
    },
  };
}

let _kv;
async function kv() {
  if (_kv) return _kv;
  if (HAS_UPSTASH) {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    _kv = {
      get: (k) => redis.get(k),
      set: (k, v) => redis.set(k, v),
      del: (k) => redis.del(k),
      incr: (k) => redis.incr(k),
      incrbyfloat: (k, by) => redis.incrbyfloat(k, by),
      lpush: (k, v) => redis.lpush(k, v),
      lrange: (k) => redis.lrange(k, 0, -1),
      mget: (keys) => (keys.length ? redis.mget(...keys) : Promise.resolve([])),
    };
  } else {
    _kv = makeMemoryKv();
  }
  return _kv;
}

export function isPersistent() {
  return HAS_UPSTASH;
}

// A provider is "online" only if its agent polled recently.
export const ONLINE_TIMEOUT_MS = 90_000;

export function isProviderOnline(p, now = Date.now()) {
  if (!p?.lastSeenAt) return false;
  // Legacy/spoofed records (pre anti-spoof) must re-register with nvidia-smi data.
  if (!p.gpuRawName) return false;
  return now - p.lastSeenAt < ONLINE_TIMEOUT_MS;
}

// Keys
const K = {
  job: (id) => `nq:job:${id}`,
  jobs: "nq:jobs",
  prov: (id) => `nq:prov:${id}`,
  provs: "nq:providers",
  seq: "nq:seq",
  burned: "nq:stats:burned",
  paid: "nq:stats:paid",
};

async function nextId(prefix) {
  const db = await kv();
  const n = await db.incr(K.seq);
  return `${prefix}_${n}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------- Providers ----------

export async function listProviders() {
  const db = await kv();
  const ids = await db.lrange(K.provs);
  if (!ids.length) return [];
  const rows = await db.mget(ids.map(K.prov));
  return rows
    .filter(Boolean)
    .sort((a, b) => b.reputation - a.reputation);
}

export async function getProvider(pid) {
  const db = await kv();
  return (await db.get(K.prov(pid))) || null;
}

// Providers report raw GPU name + VRAM from nvidia-smi. WE assign the tier.
export async function createProvider({ name, gpuRawName, vramGb, wallet }) {
  const db = await kv();
  const pid = await nextId("prov");
  const assigned = resolveGpuTier({ gpuRawName, vramGb });
  const provider = {
    id: pid,
    name,
    gpuModel: assigned.gpuModel,
    gpuRawName: assigned.gpuRawName,
    vramGb: assigned.vramGb,
    tier: assigned.tier,
    tierSource: assigned.tierSource,
    reputation: 1,
    wins: 0,
    jobsEntered: 0,
    earned: 0,
    online: true,
    lastSeenAt: Date.now(),
    wallet: wallet || "",
  };
  await db.set(K.prov(pid), provider);
  await db.lpush(K.provs, pid);
  return provider;
}

// Re-attach an existing provider with the same wallet (agent restarts). One wallet
// = one provider slot; GPU info is refreshed every time they register.
export async function upsertProvider({ name, gpuRawName, vramGb, wallet }) {
  if (wallet) {
    const all = await listProviders();
    const existing = all.find((p) => p.wallet === wallet);
    if (existing) {
      const assigned = resolveGpuTier({ gpuRawName, vramGb });
      const updated = {
        ...existing,
        name,
        gpuModel: assigned.gpuModel,
        gpuRawName: assigned.gpuRawName,
        vramGb: assigned.vramGb,
        tier: assigned.tier,
        tierSource: assigned.tierSource,
        online: true,
        lastSeenAt: Date.now(),
      };
      const db = await kv();
      await db.set(K.prov(existing.id), updated);
      return updated;
    }
  }
  return createProvider({ name, gpuRawName, vramGb, wallet });
}

export async function updateProvider(pid, patch) {
  const db = await kv();
  const p = await db.get(K.prov(pid));
  if (!p) return null;
  const updated = { ...p, ...patch };
  await db.set(K.prov(pid), updated);
  return updated;
}

// Called on every agent poll so the dashboard knows who is actually connected.
export async function touchProvider(pid) {
  return updateProvider(pid, { lastSeenAt: Date.now(), online: true });
}

// ---------- Jobs ----------

export async function listJobs() {
  const db = await kv();
  const ids = await db.lrange(K.jobs);
  if (!ids.length) return [];
  const rows = await db.mget(ids.map(K.job));
  return rows.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getJob(jid) {
  const db = await kv();
  return (await db.get(K.job(jid))) || null;
}

// The poster picks a WORKLOAD; WE assign the tier from it (never the poster).
export async function createJob({ id, title, workload, workloadLabel, input, tier, reward, poster, deadlineSec, depositTx }) {
  const db = await kv();
  const jid = id;
  const job = {
    id: jid,
    title,
    workload,
    workloadLabel,
    input: input || title,
    tier,
    reward: Number(reward),
    poster: poster || "anon",
    depositTx: depositTx || null,
    status: "open",
    submissions: [],
    createdAt: Date.now(),
    deadline: Date.now() + (Number(deadlineSec) || 60) * 1000,
    winner: null,
    settlement: null,
  };
  await db.set(K.job(jid), job);
  await db.lpush(K.jobs, jid);
  return job;
}

export async function newJobId() {
  return nextId("job");
}

export async function addSubmission(jid, submission) {
  const db = await kv();
  const job = await db.get(K.job(jid));
  if (!job) return null;
  job.submissions.push(submission);
  await db.set(K.job(jid), job);
  const p = await db.get(K.prov(submission.providerId));
  if (p) {
    p.jobsEntered = (p.jobsEntered || 0) + 1;
    await db.set(K.prov(p.id), p);
  }
  return job;
}

// Open jobs a provider is eligible for and hasn't entered yet (used by agents).
export async function claimableJobs(tier, providerId) {
  const jobs = await listJobs();
  return jobs.filter(
    (j) =>
      j.status === "open" &&
      j.tier === Number(tier) &&
      !j.submissions.some((s) => s.providerId === providerId)
  );
}

export async function setJob(jid, patch) {
  const db = await kv();
  const job = await db.get(K.job(jid));
  if (!job) return null;
  const updated = { ...job, ...patch };
  await db.set(K.job(jid), updated);
  return updated;
}

export async function newSubmissionId() {
  return nextId("sub");
}

// ---------- Stats (burn + payouts) ----------

export async function addBurn(amount) {
  const db = await kv();
  return db.incrbyfloat(K.burned, Number(amount));
}

export async function addPaid(amount) {
  const db = await kv();
  return db.incrbyfloat(K.paid, Number(amount));
}

export async function getStats() {
  const db = await kv();
  const [burned, paid] = await Promise.all([
    db.get(K.burned),
    db.get(K.paid),
  ]);
  return {
    burned: Number(burned) || 0,
    paid: Number(paid) || 0,
  };
}
