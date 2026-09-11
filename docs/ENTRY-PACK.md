# ENTRY-PACK — Gibwork Developer Hackathon Bounty (1000 USDC, deadline 2026-10-30T04:00Z)

- **Generated**: 2026-09-11T18:17Z (local 2026-09-12 02:17, UTC+8) · preparation subagent
- **Machine-readable twin**: `bounty-workbench/data/gibwork-entry-pack-20260911.json`
- **Primary evidence**: `workstreams/new-sources/gibwork-deep-20260911-1745Z.md` (+ `_gib/*` raw captures)
- **Scope**: this pack creates nothing and sends nothing. No account, no Discord join, no form submitted, no wallet connected, no message sent, no transaction signed.
- **Status of every item is third-hand-explicit**: values below carried from the deep-dive report were re-verified against the raw captures `_gib/gform-data.json`, `_gib/task-object.json`, `_gib/discord-invites.json`, `_gib/explore-p1.json`, `_gib/readme-SDK.md`. Anything not in the sources is marked **未找到**.

---

## 1. Extracted facts (with evidence)

| Item | Value | Evidence (URL + capture time) |
|---|---|---|
| Bounty | Gibwork Developer Hackathon Bounty, id `1052f22d-3f87-4b1d-b0d7-71a60679e7fa` | `https://gib.work/bounty/1052f22d-3f87-4b1d-b0d7-71a60679e7fa` @ 2026-09-11T17:31:33Z (HTTP 200, no login) |
| **Google Form URL** | `https://docs.google.com/forms/d/e/1FAIpQLSejpks7hItR6zBUXpdrwgUDrwvEcmnJj6nlFbUXKIyNkVVfag/viewform?usp=dialog` | bounty body @ 2026-09-11T17:11:25Z; form itself fetched @ 2026-09-11T17:29:48Z (title "Gibwork Developer Hackathon") |
| **Discord invite(s)** | `https://discord.gg/2577tTsRt` (bounty body, expires **2026-10-02T21:02:09Z**) · `https://discord.gg/jJa6tffXj` (form text, expires 2026-10-08T19:11:12Z) · `https://discord.gg/KnKvp8hsrb` (site, **permanent**) | `https://discord.com/api/v10/invites/<code>?with_counts=true` @ 2026-09-11T17:34:33Z |
| Discord guild | `WORK`, id `1004566368475164683`, ≈4054 members | same three invite records; matches `requiredDiscordGuildId` |
| **Hackathon role** | `1546941199859060768` — role *name* **未找到** (needs bot permissions) | `_gib/task-object.json` → `"requiredDiscordRoleIds":["1546941199859060768"]` @ 2026-09-11T17:34:21Z |
| Meeting requirement | "Must attend at least 2 of the hackathon sessions on Discord." | bounty body @ 2026-09-11T17:11:25Z |
| **Meeting schedule** | **未找到** — session times/format are only visible inside the Discord server (login required); no public calendar exists. | Discord channel content unreadable @ 2026-09-11T17:34Z |
| Deadline | `2026-10-30T04:00:00.000Z` = 2026-10-30 12:00 Beijing (48.4 days from now) | detail payload @ 2026-09-11T17:34:21Z |
| Reward | 1000 USDC advertised; escrow `9Nw5KFDj2vZsBJnQiYpKxpr9K2P1UkJGooLX9MtPWaEd` verified on Solana mainnet = 1000 USDC (`1000000000` / decimals 6), deposit `kCeLQ…ae8bV` `finalized` | `POST api.gib.work/vaults` @ 17:33:00Z + Solana RPC @ 17:33:55Z |
| Pool split | `minSubmissionAmount = 50` → possibly up to ~20 payouts; **allocation rule 未找到** | detail payload @ 2026-09-11T17:34:21Z |
| Competition | `submissionCount = 0`, `approvedCount = 0`, `health.status = "healthy"` | detail payload @ 2026-09-11T17:34:21Z |
| Platform gate | login + Discord role required; `allowOnlyVerifiedSubmissions=false`; `minTwitterFollowers=0` | detail payload @ 2026-09-11T17:34:21Z |
| **Submission fee** | **~0.15 USDC** per submission ("currently **0.15 USDC**. Network costs are sponsored."); **applicability to this bounty 未确认** (bounty page states no fee) | `@gibwork/sdk` README @ 2026-09-11T17:31:10Z (`_gib/readme-SDK.md`) |
| Platform fee at payout | deducted at escrow release per ToS §7; **percentage 未找到** | `https://gib.work/terms` @ 2026-09-11T17:26:21Z |
| Earnings route | on-chain escrow release to the wallet bound to the Gibwork account; optional Decaf withdrawal to fiat; no KYC clause found (未找到) | ToS §7/§8; `https://docs.gib.work/getting-started/referrals.md`, `.../decaf-integration.md` @ 17:30Z |
| Evaluation criteria | **未找到** — no published weights, judges or ranking rule | bounty page requirements field is template placeholder text |

### Registration steps (gib.work)
1. Sign up with **email + OTP** — ToS §4: "Account registration is handled through our authentication provider (Clerk) using email-based one-time password (OTP) verification." Use `summerlx0416@gmail.com`.
2. **Connect a Solana wallet** — ToS §7: all bounty payments run on-chain through the Solana escrow program. Candidate wallet: `B1wkZn4UDmt8x1AMJ54wCrJdhSbrAQvJ1kgPCVFE77ft`.
3. Optional (not needed here): phone/X verification for the Verified badge — this bounty has `allowOnlyVerifiedSubmissions: false`.
4. Fund the wallet with **≥ 0.15 USDC** before submitting. As of 2026-09-11T17:36Z that address had **0 SOL, no account data, no USDC token account (ATA)**. Private-key custody of that address has never been verified and must not be verified by signing.

### What to submit (from the bounty body)
Public GitHub repo URL + all source and README · short written summary of the use case/value/toolset (SDK, CLI or MCP) · setup and usage instructions (install, env vars, commands, sample IO) · screen recording / demo video URL · screenshots of it running · exported deliverables. Hard requirements: uses SDK/CLI/MCP as a core part, new use case, **not** a web app / dashboard / browser product.

---

## 2. Google Form — ready-to-paste answers (English)

Form title: **Gibwork Developer Hackathon**. It is a **screening** application (8 questions), not the work submission. Paste the text below verbatim; every answer is honest about AI assistance and matches `PROFILE_SINGLE_SOURCE.md` (Xiatian Liu / summerlx0416@gmail.com / github.com/summerlx0416-droid).

**Q1. Did you join the discord?** → **Yes**
*(only tick Yes after you really joined — see checklist step 2–3)*

**Q2. Are you currently building a product?** → **Yes - Escrow Sentinel, a read-only Gibwork bounty radar (CLI + MCP server) built for this hackathon.** *(17 words)*

**Q3. What's your Github profile url?** →
```
https://github.com/summerlx0416-droid
```

**Q4. What's your Discord username?** → `YOUR_DISCORD_USERNAME` — **未找到**: your own handle is not recorded anywhere in the workspace. Copy it from Discord → Settings → My Account.

**Q5. Tell us about your Software Engineering Experience** *(120 words)* →
```
I am a master's student in Information and Computational Science at Beijing University of Posts and Telecommunications (enrolled Sep 2025), working as a Python data and automation engineer. I build ETL and data-cleaning pipelines in pandas and SQL with row-level audit trails, REST integrations, and reproducible ML prototypes (PyTorch, scikit-learn). Academic projects include a graph neural network for social-network behaviour prediction (~8% AUC gain) and a campus recommender (~12% CTR gain). I ship small tools end to end: TypeScript/Node CLIs, tests and English docs. For this hackathon I built Escrow Sentinel, a read-only Gibwork bounty radar CLI plus MCP server that verifies Solana escrow on-chain. I use Claude Code and Codex as pair-programming tools and review every change before shipping.
```

**Q6. What AI tools do you use?** → tick **Codex**, **Claude**, **Cursor**; free-text box:
```
Claude (Claude Code) and Codex as pair-programming assistants for design, TypeScript implementation, tests and documentation; Cursor as an editor. Every command, output and claim in the project was re-run and reviewed by me.
```

**Q7. What programming languages do you use?** → tick **Python**, **Typescript**; free-text box: `C++, SQL`
```
Python (primary, data/automation), TypeScript and Node.js (the Escrow Sentinel CLI + MCP server), C++ and SQL from coursework and numerical-computing projects.
```

**Q8. Why should you be accepted?** *(107 words)* →
```
Because the prototype already runs. Escrow Sentinel is a new non-web-app Gibwork use case: it discovers open bounties from the public listing, reads each escrow token account on Solana mainnet, compares the chain balance with the platform ledger, ranks opportunities by value, competition and deadline, diffs snapshots over time and exports Markdown, CSV and JSON. Four read-only MCP tools let Claude Code, Codex or Cursor answer which Gibwork bounties actually hold funds with evidence instead of marketing. It ships with 46 offline tests, a committed real fixture and screenshots. I can attend the Discord sessions, demo it live and extend it with escrow withdrawal tracking and alerting.
```

> Identity values for the platform registration (the form does not ask for them): **Name** Xiatian Liu · **Email** summerlx0416@gmail.com · **GitHub** summerlx0416-droid · **Wallet** `B1wkZn4UDmt8x1AMJ54wCrJdhSbrAQvJ1kgPCVFE77ft` · **Location** Beijing, China (UTC+8).

---

## 3. Pre-submission checklist (human, ~10 minutes)

| # | min | Do this | Verify |
|---|---|---|---|
| 1 | 1 | Open the Google Form and confirm it still shows the 8 questions in §1 order. | Title = "Gibwork Developer Hackathon". |
| 2 | 1 | Join Discord with the **permanent** invite `https://discord.gg/KnKvp8hsrb` (fallback: body link `https://discord.gg/2577tTsRt`, expires 2026-10-02). | Server "WORK", ≈4000 members. |
| 3 | 1 | Copy your exact Discord username (Settings → My Account). | Matches the account you joined with. |
| 4 | 2 | Paste Q1–Q8 from §2; tick Claude + Codex + Cursor, Python + Typescript, add C++ and SQL. | Q5 = 120 words, Q8 = 107 words (both ≤120). |
| 5 | 1 | Submit the form; keep the confirmation screenshot + "edit response" link. | "Your response has been recorded". |
| 6 | 2 | In Discord, wait for / ask about the **Hackathon role** `1546941199859060768`. | Role appears on your member card; hackathon channels become visible. |
| 7 | 2 | Read pinned messages in the hackathon channel; note **≥ 2 session dates** (schedule is 未找到 outside Discord). | Two sessions in your calendar, times converted to UTC+8. |
| 8 | 2 | Register at `https://gib.work` with summerlx0416@gmail.com + email OTP, then connect wallet `B1wkZn4UDmt8x1AMJ54wCrJdhSbrAQvJ1kgPCVFE77ft`. | Profile shows the wallet; sign nothing you do not understand. |
| 9 | 1 | Fund that wallet with **≥ 0.15 USDC**. | Explorer shows a USDC token account holding ≥ 0.15 USDC. |
| 10 | 1 | Open the bounty page and check the submit button is not blocked by a role warning. | `https://gib.work/bounty/1052f22d-3f87-4b1d-b0d7-71a60679e7fa` shows deadline 2026-10-30T04:00Z. |
| 11 | 1 | Re-run the local smoke test (see §4). | `--help` exits 0; `rank --offline` prints the hackathon bounty #1 at 87.9. |
| 12 | 1 | Before the real work submission, tick the six deliverables against the repo. | Repo public; README covers use case + toolset + setup + sample IO; video URL opens in a private window; screenshots committed. |

**Afterwards, verify (write nothing):** role present → form confirmation email/receipt → wallet funded → platform submit button reachable. Then, and only then, submit the work.

---

## 4. MVP verification (actual output, 2026-09-11T18:05–18:15Z)

Commands were taken from `README.md` / `package.json`. Live-network commands (`discover`, `verify` live, `report` live) were **not** run; everything below is offline or build/test.

```console
$ node --version
v24.18.0

$ node dist/cli.js --help            # exit 0
escrow-sentinel v0.1.0 — read-only Gibwork bounty radar with on-chain escrow checks.
Usage: node dist/cli.js <command> [options]
Commands: discover | verify | rank | diff | report | mcp | tools | help
Options: --source <auto|live|fixture> --fixture <path> --snapshot <path> --rpc <url>
         --no-rpc --offline --enrich/--no-enrich --vault/--no-vault --top <n>
         --limit <n> --now <iso> --json --out <path> --out-dir <dir>

$ node dist/cli.js tools             # exit 0 — MCP server card
{ "name": "escrow-sentinel", "version": "0.1.0", "protocolVersion": "2025-06-18",
  "tools": ["gib_list_bounties","gib_verify_escrow","gib_snapshot_diff","gib_report"],
  "transport": "stdio", "readOnly": true,
  "config": { "source": "auto", "exploreUrl": "https://api.gib.work/explore?page=1",
              "vaultUrl": "https://api.gib.work/vaults",
              "rpcEndpoint": "https://api.mainnet-beta.solana.com",
              "fixturesDir": "fixtures", "snapshotsDir": "snapshots" } }

$ node dist/cli.js rank --offline --top 5      # exit 0
escrow-sentinel v0.1.0 — rank (top 5 of 9)
snapshot   snapshots/bounties-20260911T180206Z.json
formula    score = 100 * (0.40*value + 0.25*competition + 0.15*urgency + 0.10*trust + 0.10*coverage)
#    Score  Bounty                                           Value used  Subs  Deadline  Escrow    Flags
1    87.9   Gibwork Developer Hackathon Bounty               1000 USDC   0     48.4d     verified  discord_role_required
2    63.0   Create an X thread for Paid Requests             125 USDC    139   0.9d      verified  —
3    61.0   Introduce Yourself to the Community              120 USDC    49    8.9d      verified  verified_only
4    60.6   Share How You Actually Use BASIS Pick ONE Theme  145 USDC    214   13.6d     verified  —
5    59.5   Axzra outreach Agent's Bounty                    50 USDC     6     7.2d      verified  discord_role_required, discord_guild_only

$ node dist/cli.js verify --offline            # exit 0
Status    Bounty                                           Platform  On-chain     Coverage  Flags
verified  Gibwork Developer Hackathon Bounty               1000      1000 USDC    100%      —
verified  Refer. Share. Win upto $300 USDC                 120       120 CREDITS  40%       coverage_partial, title_asset_hint_mismatch
verified  Share How You Actually Use BASIS Pick ONE Theme  145       145 USDC     100%      —
verified  Introduce Yourself to the Community              120       120 USDC     100%      —
verified  Create an X thread for Paid Requests             125       125 USDC     100%      —
verified  Axzra outreach Agent's Bounty                    50        50 USDC      100%      —
verified  Write an X post about Velo (Hedera DeFi)         4         4 USDC       100%      —
verified  Engage with @DHiveWorkng on Twitter/X            10        10 USDC      100%      —
verified  Flaunt your Verychat Login Streaks               4         4 USDC       100%      —
summary    9 verified / 0 mismatch / 0 unknown  (of 9)
saved      snapshots/bounties-20260911T180206Z.json

$ node --test                        # exit 0 — 46 tests, no network
ℹ tests 46 · pass 46 · fail 0 · duration_ms 2356.6045

$ cmd /c npm test                    # exit 0 — README script (npm run build && node --test)
ℹ tests 46 · pass 46 · fail 0 · duration_ms 2325.1383
# note: npm.ps1 is blocked by this machine's PowerShell execution policy
# ("running scripts is disabled on this system"), so npm test was run via cmd /c.

$ echo '<initialize> <tools/list>' | node dist/cli.js mcp      # exit 0
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"escrow-sentinel","version":"0.1.0"}}}
{"jsonrpc":"2.0","id":2,"result":{"tools":[gib_list_bounties, gib_verify_escrow, gib_snapshot_diff, gib_report ... full input schemas]}}
```

**Result**: MVP verified working — 46/46 tests pass, all four CLI commands exit 0, MCP stdio handshake answered, escrow row for the target bounty = platform 1000 vs on-chain 1000 USDC (100%). **No failures. No source file modified.** Writes were ordinary tool artifacts only: `dist/` (rebuilt by `npm test`) and `snapshots/bounties-20260911T180206Z.json` (rewritten in place by `verify --offline`, no new file). Full exact outputs are stored in the JSON twin under `cli_verification.commands`.

**Revision note**: another worker was editing this project while the checks ran (`src/cli.ts` mtime 2026-09-11T18:06:00Z, `dist/cli.js` rebuilt 18:15:21Z — this preparation agent wrote no source file). The results were re-confirmed at **2026-09-11T18:18:08Z** against that revision: `rank --offline` exit 0, `node --test` 46/46 pass (2490 ms). Per-file SHA-256 prefixes are recorded in the JSON twin (`cli_verification.verification_revision`) so a later diff can tell whether the verified build is the one being submitted.

*(Note on exit codes: `node dist/cli.js rank … | Select-Object -First 8` reports `-1` because PowerShell closes the pipe early; the un-piped run exits 0.)*

---

## 5. 未找到 / unconfirmed (do not treat as fact)

1. Hackathon session **schedule, format, language** → Discord login required.
2. Discord **role name** for `1546941199859060768` → needs bot permissions.
3. Form **screening cycle / acceptance ratio**.
4. **Reward split**: one winner vs ~20 × 50 USDC (`minSubmissionAmount = 50` is an inference).
5. Whether the **0.15 USDC fee** applies to this bounty (SDK-level statement only).
6. **Platform fee %** deducted at escrow release.
7. **KYC** at payout → no KYC clause found in the ToS (not the same as "no KYC").
8. **Public GitHub repo** for Escrow Sentinel → does not exist yet; must be created and pushed.
9. **Your Discord username**.
10. Evaluation weights / judges / ranking rule.

---

## 6. The three things only the human can do

1. **Join Discord and be present**: get role `1546941199859060768` and attend ≥ 2 sessions (schedule is only visible after joining).
2. **Own the accounts and the money**: gib.work email-OTP registration, wallet connect, funding ≥ 0.15 USDC (the wallet is empty and has no USDC token account).
3. **Submit the form and later the work**: Google Form response, public GitHub repo, demo video — with AI assistance disclosed as in §2.
