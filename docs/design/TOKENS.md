# Relay design system

Source: `apps/dashboard/src/style.css`. Dark first, dense infrastructure workspace.

| Token | Value / purpose |
|---|---|
| Background | #111315 |
| Surface / raised | #171a1d / #202428 |
| Border | #30363b |
| Primary / muted text | #edf0f2 / #a6afb7 |
| Signature / focus | #80d8cc / #9ce9df |
| Success / warning / failure | #8cddae / #edc982 / #f3a2a2 |
| Interface / technical font | Self-hosted Geist / Geist Mono |
| Body / metadata / title | 14 px / 9–11 px / 29 px |
| Spacing | 4, 8, 12, 16, 20, 24, 32 px |
| Radius | 5–8 px; 10 px dialog |
| Motion | 140 ms; disabled under reduced-motion |

Components: page titles, compact metrics, real connection map, structured rows/tables, badges, feedback, form fields, labelled modal, command navigation, one-time secret dialog, execution timeline, bounded JSON inspector. Status always includes text, never just color. Font/icon licences are shipped by pinned packages. Desktop/mobile49-state screenshot review and keyboard evidence are recorded in docs/evidence/m4/visual/review.json and docs/design/REVIEW.md. Full assistive-technology certification is not claimed.
