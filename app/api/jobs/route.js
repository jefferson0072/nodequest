import { NextResponse } from "next/server";
import { listJobs, createJob, newJobId, getStats } from "@/lib/store";
import { paymentsConfigured, verifyDeposit } from "@/lib/solana";
import { WORKLOAD_CATALOG, assignJobTier } from "@/lib/tiers";

export async function GET() {
  const [jobs, stats] = await Promise.all([listJobs(), getStats()]);
  return NextResponse.json({
    jobs,
    stats,
    paymentsReady: paymentsConfigured(),
    workloads: WORKLOAD_CATALOG,
  });
}

export async function POST(req) {
  const body = await req.json();
  if (!body.title || !body.workload || !body.reward) {
    return NextResponse.json(
      { error: "title, workload and reward required" },
      { status: 400 }
    );
  }
  if (!WORKLOAD_CATALOG[body.workload]) {
    return NextResponse.json({ error: "unknown workload" }, { status: 400 });
  }

  const reward = Number(body.reward);
  let depositTx = null;

  // When payments are live, the bounty must be funded by the poster: verify the
  // QST deposit landed in escrow before opening the job.
  if (paymentsConfigured()) {
    if (!body.depositTx || !body.poster) {
      return NextResponse.json(
        { error: "deposit required: fund the bounty from your wallet first" },
        { status: 400 }
      );
    }
    // Replay protection: a deposit tx can only back one job.
    const existing = await listJobs();
    if (existing.some((j) => j.depositTx === body.depositTx)) {
      return NextResponse.json(
        { error: "this deposit was already used for another bounty" },
        { status: 400 }
      );
    }
    const check = await verifyDeposit({
      signature: body.depositTx,
      amount: reward,
      fromWallet: body.poster,
    });
    if (!check.ok) {
      return NextResponse.json(
        { error: `deposit verification failed: ${check.reason}` },
        { status: 400 }
      );
    }
    depositTx = body.depositTx;
  }

  const id = await newJobId();
  const job = await createJob({
    id,
    title: body.title,
    workload: body.workload,
    workloadLabel: WORKLOAD_CATALOG[body.workload].label,
    input: body.input,
    tier: assignJobTier(body.workload),
    reward,
    poster: body.poster,
    deadlineSec: body.deadlineSec,
    depositTx,
  });
  return NextResponse.json({ job });
}
