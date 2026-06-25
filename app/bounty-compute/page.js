"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const TIER_LABEL = { 1: "Light", 2: "Standard", 3: "Heavy" };

export default function BountyComputePage() {
  const [jobs, setJobs] = useState([]);
  const [providers, setProviders] = useState([]);
  const [workloads, setWorkloads] = useState({});
  const [paymentsReady, setPaymentsReady] = useState(false);
  const [stats, setStats] = useState({ burned: 0, paid: 0 });
  const [origin, setOrigin] = useState("https://your-app.vercel.app");
  const [toast, setToast] = useState(null);

  const [jobForm, setJobForm] = useState({
    title: "",
    workload: "",
    input: "",
    reward: 100,
  });

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const load = useCallback(async () => {
    const [j, p] = await Promise.all([
      fetch("/api/jobs").then((r) => r.json()),
      fetch("/api/providers").then((r) => r.json()),
    ]);
    setJobs(j.jobs || []);
    setPaymentsReady(!!j.paymentsReady);
    setStats(j.stats || { burned: 0, paid: 0 });
    setWorkloads(j.workloads || {});
    setProviders(p.providers || []);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function postJob(e) {
    e.preventDefault();
    if (!jobForm.title) return flash("Give the job a title");
    if (!jobForm.workload) return flash("Pick a workload");
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobForm),
    }).then((r) => r.json());
    if (res.error) return flash(res.error);
    flash(`Bounty posted — Tier ${res.job.tier} assigned · ${jobForm.reward} QST`);
    setJobForm({ title: "", workload: "", input: "", reward: 100 });
    load();
  }

  async function settle(jobId) {
    const res = await fetch(`/api/jobs/${jobId}/settle`, {
      method: "POST",
    }).then((r) => r.json());
    if (res.error) return flash(res.error);
    flash(`Winner: ${res.settlement.winnerName} — paid ${res.settlement.payout} QST`);
    load();
  }

  const openJobs = jobs.filter((j) => j.status === "open").length;
  const settledJobs = jobs.filter((j) => j.status === "paid").length;

  return (
    <main className="site-wrap">
      <header className="topbar">
        <Link href="/" className="brand-link">
          <Image src="/logo.png" alt="NodeQuest" width={34} height={34} className="brand-image" />
          <span>NodeQuest</span>
        </Link>
        <nav className="nav">
          <Link href="/how-it-works">How it works</Link>
          <span className={"pill" + (paymentsReady ? "" : " sim")}>
            {paymentsReady ? "Live payouts" : "Payouts not configured"}
          </span>
        </nav>
      </header>

      {!paymentsReady && (
        <div className="notice">
          Live payouts are off. Deploy the QST token and set{" "}
          <code>SOLANA_RPC_URL</code>, <code>TOKEN_MINT</code> and{" "}
          <code>PLATFORM_WALLET_SECRET</code> to enable on-chain settlement and
          burns.
        </div>
      )}

      <section className="stats-grid compact">
        <Stat plain label="Open bounties" value={openJobs} />
        <Stat plain label="Connected GPUs" value={providers.length} />
        <Stat plain label="Settled jobs" value={settledJobs} />
        <Stat plain label="Total paid" value={`${stats.paid.toFixed(1)} QST`} />
        <Stat plain accent label="Total burned" value={`${stats.burned.toFixed(1)} QST`} />
      </section>

      <section className="dashboard-grid">
        <section className="activity-column">
          <article className="module board-card">
            <div className="card-head">
              <h3>Job board</h3>
              <span className="mini">{jobs.length} total</span>
            </div>
            {jobs.length === 0 && <div className="empty">No jobs yet.</div>}
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onSettle={() => settle(job.id)} />
            ))}
          </article>

          <article className="module providers-card">
            <div className="card-head">
              <h3>Connected GPUs</h3>
              <span className="mini">{providers.length} online</span>
            </div>
            {providers.length === 0 && (
              <div className="empty">
                No GPUs connected yet. Run the provider agent on a machine to
                join.
              </div>
            )}
            <div className="provider-list">
              {providers.map((p) => (
                <div className="prov" key={p.id}>
                  <div>
                    <div>
                      {p.name}{" "}
                      <span className={`tag t${p.tier}`}>
                        Tier {p.tier} · {TIER_LABEL[p.tier]}
                      </span>
                    </div>
                    <div className="meta">
                      {p.gpuModel} · {p.vramGb}GB · {p.wins} wins · {p.earned} QST
                    </div>
                  </div>
                  <RepDots rep={p.reputation} />
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="actions-column">
          <article className="module form-module">
            <h3>Post bounty</h3>
            <form onSubmit={postJob}>
              <label>Job title</label>
              <input
                placeholder="Generate 512x512 image"
                value={jobForm.title}
                onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
              />
              <label>Input / prompt (optional)</label>
              <input
                placeholder="a neon fox in tokyo"
                value={jobForm.input}
                onChange={(e) => setJobForm({ ...jobForm, input: e.target.value })}
              />
              <div className="row">
                <div>
                  <label>Workload</label>
                  <select
                    value={jobForm.workload}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, workload: e.target.value })
                    }
                  >
                    <option value="">Select workload</option>
                    {Object.keys(workloads).map((key) => (
                      <option key={key} value={key}>
                        {workloads[key].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Reward (QST)</label>
                  <input
                    type="number"
                    min="1"
                    value={jobForm.reward}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, reward: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="assigned">
                {jobForm.workload ? (
                  <>
                    Assigned by platform:{" "}
                    <strong>
                      Tier {workloads[jobForm.workload]?.tier} ·{" "}
                      {TIER_LABEL[workloads[jobForm.workload]?.tier]}
                    </strong>
                  </>
                ) : (
                  "Select workload to preview assigned tier."
                )}
              </div>
              {jobForm.reward > 0 && (
                <div className="split-preview">
                  Winner gets <strong>{(jobForm.reward * 0.8).toFixed(0)} QST</strong>{" "}
                  · burned <strong>{(jobForm.reward * 0.2).toFixed(0)} QST</strong>
                </div>
              )}
              <button type="submit">Post bounty</button>
            </form>
          </article>

          <article className="module form-module">
            <h3>Connect a GPU</h3>
            <p className="meta">
              Providers join by running the agent on a real machine (needs
              Node.js 18+, no install) — it detects the GPU, registers, and
              competes for jobs automatically.
            </p>

            <div className="runtime-head">Install a runtime to serve jobs</div>
            <div className="runtime-list">
              <a
                className="runtime"
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
              >
                <div className="runtime-name">Ollama ↗</div>
                <div className="runtime-desc">
                  Text / LLM jobs — small, medium &amp; large models
                </div>
              </a>
              <a
                className="runtime"
                href="https://github.com/comfyanonymous/ComfyUI"
                target="_blank"
                rel="noreferrer"
              >
                <div className="runtime-name">ComfyUI ↗</div>
                <div className="runtime-desc">
                  Image jobs — SDXL &amp; 512×512 generation
                </div>
              </a>
            </div>
            <div className="runtime-note">
              More runtimes (video / fine-tuning) coming soon.
            </div>

            <div className="runtime-head">Then run the agent</div>
            <pre className="code-snippet">
node bounty-agent.mjs \{"\n"}  --name my-rig \{"\n"}  --wallet YOUR_SOLANA_ADDRESS \{"\n"}  --server {origin}
            </pre>
            <a className="agent-download" href="/bounty-agent.mjs" download>
              Download agent ↓
            </a>
          </article>
        </section>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function JobCard({ job, onSettle }) {
  return (
    <div className="job">
      <div className="job-top">
        <div>
          <div className="job-title">{job.title}</div>
          <div className="meta mt4">{job.workloadLabel}</div>
          <div className="mt6">
            <span className={`tag t${job.tier}`}>
              Tier {job.tier} · {TIER_LABEL[job.tier]}
            </span>
            <span className={`status ${job.status}`}>{job.status}</span>
          </div>
        </div>
        <div className="reward">{job.reward} QST</div>
      </div>

      {job.submissions.length > 0 && (
        <div className="subs">
          {job.submissions.map((s) => (
            <div className="subrow" key={s.id}>
              <span className={job.winner === s.providerId ? "win" : ""}>
                {job.winner === s.providerId ? "🏆 " : ""}
                {s.providerName}
              </span>
              <span>
                {s.elapsedMs} ms ·{" "}
                {job.status === "paid" ? (
                  <span className={s.valid ? "ok" : "bad"}>
                    {s.valid ? "valid" : "rejected"}
                  </span>
                ) : (
                  <span className="faded">pending</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {job.status === "open" && (
        <div className="actions">
          <button
            className="small good"
            onClick={onSettle}
            disabled={job.submissions.length === 0}
          >
            Verify & settle
          </button>
        </div>
      )}

      {job.settlement && (
        <div className="receipt">
          result: {job.settlement.result}
          <br />
          winner: {job.settlement.winnerName} ({job.settlement.odds}% odds)
          <br />
          payout: {job.settlement.payout} QST · burned: {job.settlement.burn} QST
          <br />
          route: {job.settlement.routeHash}
        </div>
      )}
    </div>
  );
}

function RepDots({ rep }) {
  return (
    <span className="rep" title={`Reputation ${rep}/10`}>
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className={"dot" + (i < rep ? " on" : "")} />
      ))}
    </span>
  );
}

function Stat({ label, value, plain = false, accent = false }) {
  return (
    <div className={`stat${plain ? " stat-plain" : ""}${accent ? " stat-accent" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
