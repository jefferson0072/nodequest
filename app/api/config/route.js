import { NextResponse } from "next/server";
import {
  paymentsConfigured,
  getPlatformAddress,
  getMintDecimals,
} from "@/lib/solana";

export const dynamic = "force-dynamic";

// Public, non-secret config the client needs to build an escrow deposit.
export async function GET() {
  const paymentsReady = paymentsConfigured();
  if (!paymentsReady) {
    return NextResponse.json({ paymentsReady: false });
  }
  const [escrowWallet, decimals] = await Promise.all([
    getPlatformAddress(),
    getMintDecimals(),
  ]);
  return NextResponse.json({
    paymentsReady: true,
    tokenMint: process.env.TOKEN_MINT,
    escrowWallet,
    decimals,
  });
}
