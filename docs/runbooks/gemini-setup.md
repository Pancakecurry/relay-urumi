# Gemini M0 spike — locally verified

`.local/gemini.env` is a private mode-0600 bootstrap file excluded from Git and Docker. Never paste the key into chat, command arguments, screenshots or evidence. Parse it with Node's dotenv parser; do not execute/source it as shell code.

Example fields (replace locally, never commit the populated file):

```dotenv
GEMINI_API_KEY=
GEMINI_CREDIT_VERIFIED=true
GEMINI_APPROVED_ALLOWANCE_USD=0
GEMINI_APPROVED_ALLOWANCE_INR=200
GEMINI_MODEL=gemini-3.5-flash-lite
```


The one-time command was `node dist/tests/spikes/gemini-spike.js`, after `pnpm check`. It bootstraps the owned `relay-m0/relay-m0-gemini` Secret, reads the runtime key without printing it, connects to the actual Ingress MCP endpoint, discovers the real schema, requests a model-chosen ping, executes it, then asks Gemini to answer from the real result. The final answer's marker and pod name must match. Evidence: `docs/evidence/gemini-spike.json` and `model-secret-check.json`.

The ledger `.local/model-budget.json` is mode 0600, updated atomically before requests under an exclusive `.local/model-budget.lock`. At most two requests, each reserving ₹50, are allowed; both have now been used. Maximum serialized request body 4096 bytes, one candidate, requested output 512 tokens, MINIMAL thinking, 45-second timeout, no retries or paid auxiliary tools. Reservations cover a larger documented output ceiling and conservative currency/margin guard; they are not actual charges. Standard token estimate for the two successful responses is $0.0003127. The invoice is unverified.

**Do not rerun this paid spike or erase its ledger.** The existing request cap deliberately prevents additional inference. Ordinary `pnpm check` runs only isolated budget/transport/session tests and makes no provider calls. A fresh checkout has no credentials/credit confirmation and cannot enable traffic by itself. If a process leaves the lock behind, review the process and ledger before manual recovery; do not steal or delete a live lock automatically.

The isolated local ledger does not enforce an account-wide or distributed product quota. M4 must carry forward the approved allowance, reconcile existing reservations/usage and implement the actual shared provider policy. The full model adapter, dashboard chat and logged-in user attribution remain unimplemented. No top-up, overage, new cloud infrastructure or local model download is authorized here.
