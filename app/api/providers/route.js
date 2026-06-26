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
  if (!body.gpuModel && !body.vramGb) {
    return NextResponse.json(
      { error: "gpuModel or vramGb required (we assign the tier)" },
      { status: 400 }
    );
  }
  // NOTE: tier is intentionally ignored if sent. We assign it from the GPU.
  const provider = await upsertProvider({
    name: body.name,
    gpuModel: body.gpuModel,
    vramGb: body.vramGb,
    wallet: body.wallet,
  });
  return NextResponse.json({ provider });
}
