# ADR0011 — explicit workspace execution defaults

Status: accepted; D02 tested locally. See docs/evidence/m6.md and the three permissions evidence records. OAuth and the complete M6 gate remain pending.

Existing workspaces retain default allow. An administrator can select default deny with a revision-checked update. Matching explicit deny is always a ceiling; otherwise a matching allow grants access, otherwise the default applies. Subjects can be the entire workspace, a role or a specific existing member; scope can be all servers, one server, all tools or one original tool name. Allow rules never grant management privileges.

The gateway and API observation filter use the same evaluator. Policy evaluation reads active membership/current role in its transaction instead of trusting a previously captured role. Cached tool aliases are reauthorized before dispatch. Discovery and search return only permitted results/counts. The agent still discovers and executes through the gateway with server-derived delegation.

Policy management rechecks admin membership inside its transaction, validates same-team member/server/tool targets, serializes duplicate rule creation and increments a permission revision. The admin-only configuration catalogue deliberately permits editing rules for tools the administrator has denied themselves; it does not grant execution or expose this catalogue to members. The product presents this distinction explicitly.

No changes to tool aliases, upstream credentials, existing key identities, invitation semantics or historical audit records are required. Default allow preserves M0–M5 behavior until an authorized policy edit. OAuth identities will enter the same evaluator rather than creating a second permissions system.
