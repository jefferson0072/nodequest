"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import WalletProviders from "./wallet-providers";
import TokenCa from "../components/token-ca";

const TIER_LABEL = { 1: "Light", 2: "Standard", 3: "Heavy" };

// Build + send a QST transfer from the poster into the escrow wallet, returning
// the confirmed signature. This is the on-chain bounty deposit.
async function depositToEscrow({ connection, publicKey, sendTransaction, cfg, amount }) {
  const mint = new PublicKey(cfg.tokenMint);
  const escrow = new PublicKey(cfg.escrowWallet);
  const fromAta = await getAssociatedTokenAddress(mint, publicKey);
  const toAta = await getAssociatedTokenAddress(mint, escrow);

  const tx = new Transaction();
  // Create the escrow's token account if it doesn't exist yet (poster pays).
  try {
    await getAccount(connection, toAta);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(publicKey, toAta, escrow, mint)
    );
  }
  const raw = BigInt(Math.round(amount * 10 ** cfg.decimals));
  tx.add(createTransferInstruction(fromAta, toAta, publicKey, raw));

  const sig = await sendTransaction(tx, connection);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

export default function BountyComputePage() {
  return (
    <WalletProviders>
      <Dashboard />
    </WalletProviders>
  );
}

function Dashboard() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [jobs, setJobs] = useState([]);
  const [providers, setProviders] = useState([]);
  const [workloads, setWorkloads] = useState({});
  const [paymentsReady, setPaymentsReady] = useState(false);
  const [stats, setStats] = useState({ burned: 0, paid: 0 });
  const [origin, setOrigin] = useState("https://your-app.vercel.app");
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState(null);
  const [jobBoardTab, setJobBoardTab] = useState("open");

  const [jobForm, setJobForm] = useState({
    title: "",
    workload: "",
    input: "",
    reward: 50000,
  });

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3600);
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
    if (Number(jobForm.reward) < 50000)
      return flash("Minimum reward is 50,000 QST");

    setPosting(true);
    try {
      const payload = { ...jobForm };

      // When payments are live, fund the bounty on-chain first.
      if (paymentsReady) {
        if (!publicKey) {
          setPosting(false);
          return flash("Connect your wallet to fund the bounty");
        }
        const cfg = await fetch("/api/config").then((r) => r.json());
        if (!cfg.paymentsReady || !cfg.escrowWallet || cfg.decimals == null) {
          setPosting(false);
          return flash("Escrow not available — check token configuration");
        }
        flash("Approve the deposit in your wallet…");
        let sig;
        try {
          sig = await depositToEscrow({
            connection,
            publicKey,
            sendTransaction,
            cfg,
            amount: Number(jobForm.reward),
          });
        } catch (err) {
          setPosting(false);
          return flash(`Deposit cancelled or failed: ${err.message}`);
        }
        payload.depositTx = sig;
        payload.poster = publicKey.toBase58();
        flash("Deposit confirmed — opening bounty…");
      }

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (res.error) {
        setPosting(false);
        return flash(res.error);
      }
      flash(`Bounty posted — Tier ${res.job.tier} · ${jobForm.reward} QST funded`);
      setJobForm({ title: "", workload: "", input: "", reward: 50000 });
      load();
    } finally {
      setPosting(false);
    }
  }

  const openJobs = jobs.filter((j) => j.status === "open").length;
  const settledJobs = jobs.filter((j) => j.status === "paid").length;
  const openBoardJobs = jobs.filter(
    (j) => j.status === "open" || j.status === "settling"
  );
  const completedBoardJobs = jobs.filter((j) => j.status === "paid");
  const boardJobs = jobBoardTab === "open" ? openBoardJobs : completedBoardJobs;

  return (
    <main className="site-wrap">
      <header className="topbar">
        <Link href="/" className="brand-link">
          <Image src="/logo.png" alt="NodeQuest" width={34} height={34} className="brand-image" />
          <span>NodeQuest</span>
        </Link>
        <TokenCa />
        <nav className="nav">
          <Link href="/how-it-works">How it works</Link>
          <a
            href="https://x.com/nodequestlol"
            target="_blank"
            rel="noreferrer"
            className="nav-icon"
            aria-label="NodeQuest on X"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path
                fill="currentColor"
                d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
              />
            </svg>
          </a>
          <a
            href="https://github.com/jefferson0072/nodequest"
            target="_blank"
            rel="noreferrer"
            className="nav-icon"
            aria-label="NodeQuest on GitHub"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.1-.76.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.42.36.79 1.08.79 2.18v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"
              />
            </svg>
          </a>
          <a
            href="https://www.linkedin.com/in/jeff-hansen-1b600a65/"
            target="_blank"
            rel="noreferrer"
            className="nav-icon"
            aria-label="NodeQuest on LinkedIn"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
              />
            </svg>
          </a>
          {paymentsReady && <WalletMultiButton />}
        </nav>
      </header>

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
              <span className="mini">{boardJobs.length} shown</span>
            </div>
            <div className="board-tabs">
              <button
                type="button"
                className={"board-tab" + (jobBoardTab === "open" ? " active" : "")}
                onClick={() => setJobBoardTab("open")}
              >
                Open
                {openBoardJobs.length > 0 && (
                  <span className="board-tab-count">{openBoardJobs.length}</span>
                )}
              </button>
              <button
                type="button"
                className={
                  "board-tab" + (jobBoardTab === "completed" ? " active" : "")
                }
                onClick={() => setJobBoardTab("completed")}
              >
                Completed
                {completedBoardJobs.length > 0 && (
                  <span className="board-tab-count">{completedBoardJobs.length}</span>
                )}
              </button>
            </div>
            {boardJobs.length === 0 && (
              <div className="empty">
                {jobBoardTab === "open"
                  ? "No open bounties right now."
                  : "No completed bounties yet."}
              </div>
            )}
            {boardJobs.map((job) => (
              <JobCard key={job.id} job={job} />
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
                      {p.gpuRawName && p.gpuRawName !== p.gpuModel && (
                        <> · detected: {p.gpuRawName}</>
                      )}
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
                placeholder="Summarize this research paper"
                value={jobForm.title}
                onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
              />
              <label>Prompt / input</label>
              <input
                placeholder="Explain quantum computing in 3 sentences"
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
                    min="50000"
                    step="1000"
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
                  {paymentsReady && (
                    <>
                      <br />
                      You deposit{" "}
                      <strong>{Number(jobForm.reward).toFixed(0)} QST</strong> into
                      escrow to fund it.
                    </>
                  )}
                </div>
              )}
              <button type="submit" disabled={posting}>
                {posting
                  ? "Working…"
                  : paymentsReady
                  ? "Fund & post bounty"
                  : "Post bounty"}
              </button>
            </form>
          </article>

          <article className="module form-module">
            <h3>Connect a GPU</h3>
            <p className="meta">
              Providers join by running the agent on a real machine (needs
              Node.js 18+, no install) — it detects the GPU, registers, and
              competes for jobs automatically. Works with NVIDIA, AMD, Intel
              Arc, and Apple Silicon.
            </p>

            <div className="runtime-head">Install Ollama + pull the model</div>
            <div className="runtime-list">
              <a
                className="runtime"
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
              >
                <div className="runtime-name">Ollama ↗</div>
                <div className="runtime-desc">
                  Required runtime for all text / LLM jobs
                </div>
              </a>
            </div>
            <div className="tier-models">
              <div className="tier-model">
                <span className={`tag t1`}>Tier 1 · Light</span>
                <code>ollama pull llama3.2:1b</code>
              </div>
              <div className="tier-model">
                <span className={`tag t2`}>Tier 2 · Standard</span>
                <code>ollama pull llama3.1:8b</code>
              </div>
              <div className="tier-model">
                <span className={`tag t3`}>Tier 3 · Heavy</span>
                <code>ollama pull llama3.1:70b</code>
              </div>
            </div>
            <div className="runtime-note">
              Your GPU tier is assigned automatically (by VRAM) when the agent
              starts — pull the model that matches your tier. AMD/Intel GPUs need
              Ollama with the right backend (ROCm / IPEX); otherwise they run on
              CPU. If VRAM isn&apos;t detected, pass{" "}
              <code>--vram &lt;GB&gt;</code>.
            </div>

            <div className="runtime-head">Then clone the repo &amp; run the agent</div>
            <pre className="code-snippet">
git clone https://github.com/jefferson0072/nodequest.git{"\n"}cd nodequest{"\n"}node agent/bounty-agent.mjs \{"\n"}  --name my-rig \{"\n"}  --wallet YOUR_SOLANA_ADDRESS \{"\n"}  --server {origin}
            </pre>
            <a
              className="agent-download"
              href="https://github.com/jefferson0072/nodequest"
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub ↗
            </a>
          </article>
        </section>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function JobCard({ job }) {
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

      {job.settlement && (
        <details className="receipt">
          <summary>
            🏆 {job.settlement.winnerName} · {job.settlement.payout} QST paid ·{" "}
            {job.settlement.burn} QST burned
          </summary>
          <div className="receipt-body">
            <div className="receipt-meta">
              {job.settlement.odds}% odds · route {job.settlement.routeHash}
            </div>
            <pre className="receipt-result">{job.settlement.result}</pre>
          </div>
        </details>
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
