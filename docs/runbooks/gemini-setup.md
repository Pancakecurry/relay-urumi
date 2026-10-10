# Gemini preparation — traffic disabled at M0

Create `.local/gemini.env` in the repository root with mode 0600. `.local/` is excluded from Git and Docker builds. Never paste the key into chat, shell arguments, screenshots or evidence. No script sources arbitrary environment files or searches the owner’s credentials.

Example fields (replace locally, never commit the populated file):

```dotenv
GEMINI_API_KEY=
GEMINI_CREDIT_VERIFIED=false
GEMINI_APPROVED_ALLOWANCE_USD=0
GEMINI_APPROVED_ALLOWANCE_INR=200
GEMINI_MODEL=gemini-3.5-flash-lite
```



The smallest intended spike is at most two requests and one real gateway tool call, with no retries, 512 maximum generated tokens per request and a conservatively reserved ₹1 per request. The policy must bound serialized input and total generation including thinking, preserve reservations after ambiguous failures and use a private atomic ledger to prevent concurrent spend. These are planned controls, not an implemented billing enforcement claim. Do not execute traffic just by changing this file's flag. The full provider adapter and product-wide quota enforcement belong to M4.

