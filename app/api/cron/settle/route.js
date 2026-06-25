import { NextResponse } from "next/server";
import { listJobs } from "@/lib/store";
import { settleJob } from "@/lib/settle";
import { paymentsConfigured } from "@/lib/solana";

export const dynamic = "force-dynamic";

// Auto-settlement. Vercel Cron calls this on a schedule (see vercel.json).
// It settles every open job whose deadline has passed and that has submissions.
// Protected by CRON_SECRET when that env var is set.
export async function GET(req) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (!paymentsConfigured()) {
    return NextResponse.json({ settled: [], skipped: "payments not configured" });
  }

  const now = Date.now();
  const jobs = await listJobs();
  const due = jobs.filter(
    (j) => j.status === "open" && j.submissions.length > 0 && now >= j.deadline
  );

  const settled = [];
  for (const j of due) {
    const res = await settleJob(j.id);
    if (!res.error) settled.push({ id: j.id, winner: res.settlement.winnerName });
  }

  return NextResponse.json({ settled, checked: due.length });
}
