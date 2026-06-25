// Weighted lottery: reliable + fast providers get better odds, but anyone
// who submits a valid result can still win. This keeps small providers alive.

// tickets = base + reputation + speed bonus + consensus bonus
// Speed/consensus bonuses help but never fully guarantee a win.
export function ticketsFor(submission, provider) {
  const base = 1;
  const repTickets = provider.reputation; // 0..10
  const speedBonus = speedBonusFor(submission); // 0..2
  const consensusBonus = submission.consensus ? 3 : 0; // agreed-on results favored
  return base + repTickets + speedBonus + consensusBonus;
}

// Faster (lower ms) submissions get up to +2 tickets.
function speedBonusFor(submission) {
  const ms = submission.elapsedMs ?? 10000;
  if (ms <= 1000) return 2;
  if (ms <= 4000) return 1;
  return 0;
}

// Pick a winner from valid submissions, weighted by tickets.
// rng() should return a float in [0, 1). Injected so we can test deterministically.
export function pickWinner(submissions, providersById, rng = Math.random) {
  const valid = submissions.filter((s) => s.valid);
  if (valid.length === 0) return null;

  const entries = valid.map((s) => {
    const provider = providersById[s.providerId];
    const tickets = ticketsFor(s, provider);
    return { submission: s, provider, tickets };
  });

  const totalTickets = entries.reduce((sum, e) => sum + e.tickets, 0);
  let roll = rng() * totalTickets;

  for (const entry of entries) {
    roll -= entry.tickets;
    if (roll < 0) {
      return { ...entry, totalTickets, odds: entry.tickets / totalTickets };
    }
  }
  // Floating point fallback.
  const last = entries[entries.length - 1];
  return { ...last, totalTickets, odds: last.tickets / totalTickets };
}
