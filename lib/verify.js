// Verification for REAL model outputs.
//
// Real inference is not bit-identical across machines (different GPUs, drivers,
// quantization, sampling), so we can't require every honest provider to produce
// the exact same hash. Instead:
//
//   1. Structural check  - output must be non-empty and well-formed, else reject.
//   2. Consensus boost   - if 2+ providers produced the SAME hash (common for
//                          deterministic text), those are "consensus-confirmed"
//                          and get extra lottery weight.
//   3. Optimistic accept - results that don't match consensus are still valid
//                          (expected for images / cross-hardware), but rely on
//                          reputation + future spot-audits to catch cheaters.
//
// This degrades gracefully: 1 provider -> accepted on reputation; many providers
// -> consensus rewards agreement. Swap for TEE attestation / zk proofs later.

function wellFormed(s) {
  return (
    typeof s.output === "string" &&
    s.output.trim().length > 0 &&
    typeof s.resultHash === "string" &&
    s.resultHash.length > 0
  );
}

export function verifySubmissions(submissions) {
  if (submissions.length === 0) return [];

  // Count hashes only among well-formed submissions.
  const counts = {};
  for (const s of submissions) {
    if (wellFormed(s)) counts[s.resultHash] = (counts[s.resultHash] || 0) + 1;
  }

  let consensusHash = null;
  let best = 0;
  for (const [hash, count] of Object.entries(counts)) {
    if (count > best) {
      best = count;
      consensusHash = hash;
    }
  }
  const consensusReached = best >= 2;

  return submissions.map((s) => {
    if (!wellFormed(s)) {
      return {
        ...s,
        valid: false,
        consensus: false,
        verifyNote: "Empty or malformed output - rejected",
      };
    }
    if (consensusReached) {
      const match = s.resultHash === consensusHash;
      return {
        ...s,
        valid: true,
        consensus: match,
        verifyNote: match
          ? "Confirmed by consensus"
          : "Accepted (independent result, no consensus match)",
      };
    }
    return {
      ...s,
      valid: true,
      consensus: false,
      verifyNote: "Accepted (single/independent result) - reputation-weighted",
    };
  });
}
