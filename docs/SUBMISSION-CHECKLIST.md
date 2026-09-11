# Submission checklist — Gibwork Developer Hackathon Bounty

Bounty: **Gibwork Developer Hackathon Bounty** (1,000 USDC pool, 50 USDC minimum payout)
Listing: <https://gib.work/bounty/1052f22d-3f87-4b1d-b0d7-71a60679e7fa>
Repository: <https://github.com/summerlx0416-droid/escrow-sentinel>
Audit performed: 2026-09-11T20:05Z against the listing's own "What to Submit" and
"Requirements" text (both quoted verbatim in `docs/ENTRY-PACK.md`).

## A. Requirements

| # | Requirement (listing) | Status | Evidence |
|---|---|---|---|
| 1 | Must use Gibwork SDK, CLI, or MCP as a **core** part of the implementation | ✅ | own read-only MCP server (4 tools) + Gibwork's own public endpoints; side-by-side capture `docs/GIBWORK-TOOLSET-CAPTURE.md`, raw stdout `docs/captures/` |
| 2 | Must be a **new** use case, not a minor variation of an existing demo | ✅ | escrow-vs-ledger verification + ranking + snapshot diff + report export; no existing Gibwork demo does escrow reconciliation (`docs/ARCHITECTURE.md`) |
| 3 | Must **not** be a web app / frontend dashboard / browser product | ✅ | terminal CLI + stdio MCP only; `src/cli.ts`, `src/mcp/server.ts`; no HTML/JSX/CSS in `src/` |
| 4 | Should solve a real developer/ops/automation/research problem with a practical outcome | ✅ | answers "is the advertised pool still escrowed, and is the competition worth it" — demonstrated on live data: 9/9 verified, 0 mismatch, 1 advertised CREDITS pool 40 % covered |
| 5 | Must include clear setup instructions, dependencies, steps to run/test | ✅ | README "Quick start" + `.env.example` + `npm test` (46 pass / 0 fail, captured in `docs/demo-captures/09-tests.txt`) |
| 6 | Functional, organized, understandable for basic reviewer validation | ✅ | 49 tracked files, TypeScript build, 10 test files, `docs/ARCHITECTURE.md`, `docs/DEMO-SCRIPT.md` |
| 7 | Must attend **at least 2 hackathon sessions on Discord** | ⏳ **human-only** | requires joining `discord.gg/2577tTsRt` / `KnKvp8hsrb` and the schedule (visible only inside Discord) |

## B. What to Submit

| # | Required item | Status | Where |
|---|---|---|---|
| 1 | Public GitHub repository URL (source + README) | ✅ | <https://github.com/summerlx0416-droid/escrow-sentinel> (public, `master`, MIT) |
| 2 | Written summary: use case, why it is valuable, **which Gibwork toolset** was used | ✅ | README §"Use case" / §"Which Gibwork toolset is used" + `docs/GIBWORK-TOOLSET-CAPTURE.md` |
| 3 | Setup + usage: install steps, env vars, commands, sample input/output | ✅ | README §"Quick start", `.env.example`, `fixtures/bounties-20260911T173421Z.json`, `reports/20260911T183525Z/{report.md,csv,json}` |
| 4 | Screen recording / demo video URL of the workflow | ✅ | **Release asset (best link for the form):** <https://github.com/summerlx0416-droid/escrow-sentinel/releases/download/v0.1.0/escrow-sentinel-demo-narrated.mp4> (4:21, 1080p30, English voice-over) · captions-only cut <https://github.com/summerlx0416-droid/escrow-sentinel/releases/download/v0.1.0/escrow-sentinel-demo.mp4> · both files are also committed under `docs/demo/` |
| 5 | Screenshots of the project running | ✅ | `screenshots/01-rank.png`, `02-discover.png`, `03-verify.png`, `04-tests.png` |
| 6 | Exported deliverables (reports, artifacts) | ✅ | `reports/<UTC-stamp>/{report.md,report.csv,report.json,snapshot.json,diff.md}` (two runs committed) |
| 7 | Public document (listing: "public Google Doc with public github repo, screenshots and any bug faced") | ⏳ **human** | text ready to paste from `docs/ENTRY-PACK.md`; needs a Drive/Docs account action |

## C. Human-only steps before submitting (≈10 minutes)

1. **Join Discord** with the permanent invite `discord.gg/KnKvp8hsrb`, ask for the
   Hackathon role (`1546941199859060768`), note the session schedule, and plan
   **≥2 sessions**.
2. **Fill the Google Form** (no name/email fields, 8 questions):
   <https://docs.google.com/forms/d/e/1FAIpQLSejpks7hItR6zBUXpdrwgUDrwvEcmnJj6nlFbUXKIyNkVVfag/viewform?usp=dialog>
   — answers are pre-written in `docs/ENTRY-PACK.md` (English, ≤120 words each);
   the only missing input is the Discord username.
3. **Gibwork account wallet**: `/account/wallet` states the Gibwork wallet is created
   **in the mobile app** ("Download Gibwork"). Install the app, sign in with
   `summerlx0416@gmail.com`, create the wallet, and check whether a submission fee
   (documented elsewhere as ~0.15 USDC) applies to this bounty.
4. **Submit** via the bounty page's "Your Submission" tab (already present on the
   listing when logged in): repo URL + demo video URL + summary + screenshots.

## D. Deliberate non-claims

- The Google Form question "Are you currently building a product?" is answered
  truthfully (side project, not a company product).
- AI assistance is disclosed in the README and in the form answers.
- No claim is made that Gibwork approved, reviewed or paid anything: the escrow
  balance of the bounty itself is read from Solana, not from a platform status field.
- The demo video is committed in-repo (75 MB) instead of being uploaded to a video
  platform, so no third-party account is required to review it.
