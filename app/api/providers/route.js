import { NextResponse } from "next/server";
import { listProviders, upsertProvider, isProviderOnline } from "@/lib/store";
import { GPU_CATALOG } from "@/lib/tiers";

export async function GET() {
  const all = await listProviders();
  const providers = all.filter(isProviderOnline);
  return NextResponse.json({ providers, catalog: GPU_CATALOG });
}

export async function POST(req) {
  const body = await req.json();
  if (!body.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!body.gpuRawName) {
    return NextResponse.json(
      { error: "gpuRawName required (from nvidia-smi — update your agent: git pull)" },
      { status: 400 }
    );
  }
  // Tier is assigned server-side from gpuRawName + VRAM. Client gpuModel is ignored.
  const provider = await upsertProvider({
    name: body.name,
    gpuRawName: body.gpuRawName,
    vramGb: body.vramGb,
    wallet: body.wallet,
  });
  return NextResponse.json({ provider });
}
