import { NextResponse } from "next/server";
import { claimableJobs, touchProvider } from "@/lib/store";

// Used by provider agents to find open jobs for their tier that they haven't
// entered yet. Returns only the fields an agent needs to run the work.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const tier = searchParams.get("tier");
  const providerId = searchParams.get("providerId");
  if (!tier) {
    return NextResponse.json({ error: "tier required" }, { status: 400 });
  }
  if (providerId) await touchProvider(providerId);
  const claimable = await claimableJobs(tier, providerId);
  const jobs = claimable.map((j) => ({
    id: j.id,
    title: j.title,
    workload: j.workload,
    input: j.input,
    tier: j.tier,
    reward: j.reward,
    deadline: j.deadline,
  }));
  return NextResponse.json({ jobs });
}
