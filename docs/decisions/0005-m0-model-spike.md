# ADR 0005 — Bounded real model feasibility

Status: locally tested M0 spike, October 10, 2026.


The key file is a private bootstrap input; the runtime reads the actual dedicated Kubernetes Secret into memory. Final bootstrap uses server-side apply with an ownership guard and base64 `data`, avoiding a key-bearing last-applied annotation. The actual model loop ran before that small bootstrap tightening; the final bootstrap was separately exercised against the real Secret without another provider request. See `evidence/model-secret-check.json`.

Controls: exclusive local file lock, atomic private reservation ledger, at most two requests, serialized body at most 4096 UTF-8 bytes, one candidate, 512 requested output tokens, MINIMAL thinking, no retries/grounding/cache/escalation, bounded request timeout. A request reserves ₹50 before sending; failed/ambiguous requests retain reservations. ₹100 maximum reservation stays within the approved ₹200. The guard uses the full documented 65,536-token output ceiling, $0.30/M input and $2.50/M output, a conservative ₹200/USD guard and 50% margin; this is not an exchange-rate observation or invoice. The ₹1/request proposal was replaced with this more conservative guard rather than relying only on requested output/thinking behavior.

Actual two requests returned 200/STOP; standard token estimate $0.0003127. ₹100 remains reserved, and the spike ledger is exhausted. Actual billed currency/credit deduction is not independently verified. Do not erase the ledger or rerun automatically. M4 must implement a durable shared usage policy and reconcile all authorized model traffic; other processes/accounts are outside this local guard.

This proves model/protocol feasibility only. It does not implement interactive chat, team identity, upstream aggregation or audit. Preserve the original `m0-verified` core tag; record the model extension in a separate checkpoint.
