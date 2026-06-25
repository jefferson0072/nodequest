// Orchestrates settling a job: verify submissions -> run lottery -> burn 20%
// -> pay winner -> update reputation -> record a receipt.

import { verifySubmissions } from "./verify";
import { pickWinner } from "./lottery";
import { payWinner, burnTokens, paymentsConfigured } from "./solana";
import { rewardWin, penalize } from "./reputation";
import {
  getJob,
  setJob,
  listProviders,
  getProvider,
  updateProvider,
  addBurn,
  addPaid,
} from "./store";

export const BURN_RATE = 0.2; // 20% of every bounty is burned; the rest (80%)
// goes to the winner. No platform fee.

export async function settleJob(jobId) {
  const job = await getJob(jobId);
  if (!job) return { error: "Job not found" };
  if (job.status === "paid") return { error: "Job already settled" };
  if (!job.submissions.length) return { error: "No submissions to settle" };
  if (!paymentsConfigured()) {
    return {
      error:
        "Payouts not configured yet. Add SOLANA_RPC_URL, TOKEN_MINT and PLATFORM_WALLET_SECRET to go live.",
    };
  }

  await setJob(jobId, { status: "settling" });

  // 1. Verify (redundancy + spot-check).
  const verified = verifySubmissions(job.submissions);

  // 2. Provider lookup.
  const providersById = {};
  for (const p of await listProviders()) providersById[p.id] = p;

  // 3. Weighted lottery picks the winner among valid submissions.
  const result = pickWinner(verified, providersById);
  if (!result) {
    await setJob(jobId, { status: "open", submissions: verified });
    return { error: "No valid submissions after verification" };
  }

  const winnerSub = result.submission;
  const winner = await getProvider(winnerSub.providerId);

  // 4. Split the bounty: burn 20%, the remaining 80% goes to the winner.
  const burn = +(job.reward * BURN_RATE).toFixed(6);
  const payout = +(job.reward - burn).toFixed(6);

  // 5. Execute on-chain: burn first, then pay the winner.
  const burnTx = await burnTokens({ jobId, amount: burn });
  await addBurn(burn);
  const tx = await payWinner({ jobId, amount: payout, toWallet: winner.wallet });
  await addPaid(payout);

  // 6. Update reputation + stats for everyone who entered.
  for (const s of verified) {
    const p = await getProvider(s.providerId);
    if (!p) continue;
    if (s.providerId === winner.id) {
      await updateProvider(p.id, {
        reputation: rewardWin(p.reputation),
        wins: p.wins + 1,
        earned: +(p.earned + payout).toFixed(6),
      });
    } else if (!s.valid) {
      await updateProvider(p.id, { reputation: penalize(p.reputation) });
    }
  }

  // 7. Receipt.
  const settlement = {
    winnerId: winner.id,
    winnerName: winner.name,
    reward: job.reward,
    burn,
    payout,
    odds: +(result.odds * 100).toFixed(1),
    totalTickets: result.totalTickets,
    result: winnerSub.output || "(no output returned)",
    resultHash: winnerSub.resultHash,
    tx,
    burnTx,
    routeHash: hashRoute(jobId, winner.id, tx.signature),
    settledAt: Date.now(),
  };

  await setJob(jobId, {
    status: "paid",
    submissions: verified,
    winner: winner.id,
    settlement,
  });

  return { job: await getJob(jobId), settlement };
}

function hashRoute(jobId, winnerId, sig) {
  const s = `${jobId}|${winnerId}|${sig}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return "route_" + (h >>> 0).toString(16);
}
