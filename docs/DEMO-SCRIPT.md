# Demo script — Escrow Sentinel (3–5 minutes, English)

Target length: **4 minutes 20 seconds**. Terminal only, no slides, no web UI —
the bounty explicitly asks for a non-web-app developer tool.

## Before you hit record (2 minutes, off camera)

```sh
cd escrow-sentinel
npm ci            # or: npm i
npm run build
node --test       # expect: pass 46 / fail 0
rm -rf snapshots/*.json   # start from a clean baseline (the fixture stays)
```

Terminal setup: 16–18 pt monospace font, dark theme, window ~110 columns wide.
The `verify` and `report` commands hit the public Solana RPC; if it rate limits,
either wait a minute or export a dedicated endpoint:
`export SOLANA_RPC_URL=https://your-rpc-endpoint`.

The take below is a single uninterrupted screen recording.

---

## Shot 1 — 0:00–0:35 · The problem

**Run:**

```sh
node dist/cli.js discover
```

**Show:** the table of 9 open bounties and the pool column.

**Narration:**

> "Gibwork is a Solana bounty board: every bounty is funded into an on-chain
> escrow before it goes live. The listing tells you the headline number — but not
> whether that money is actually still in escrow, and not how crowded the bounty
> is. Escrow Sentinel answers both, from the terminal.
>
> `discover` reads the same public listing endpoint the website uses, falls back
> to a committed fixture if the API is down, and saves a timestamped snapshot."

**On screen, point at:** `Refer. Share. Win upto $300 USDC` → `CREDITS 300`.

---

## Shot 2 — 0:35–1:35 · Verify the escrow on Solana

**Run:**

```sh
node dist/cli.js verify
```

**Show:** the status column: `verified` for nine rows, and the flags for the
CREDITS row — `coverage_partial, title_asset_hint_mismatch`, coverage `40%`.

**Narration:**

> "`verify` asks the platform for each bounty's escrow token account and then
> reads that account directly from Solana mainnet with `getAccountInfo` and
> `getTokenAccountBalance`. Nine bounties match their ledger: the money is real.
>
> Look at the second row. The title promises 300 USDC, but the listing asset is
> CREDITS and the escrow holds 120 — forty percent of the advertised pool. The
> tool flags it instead of repeating the headline.
>
> And when the chain cannot be read, the row degrades to `unknown` — never to a
> guessed number."

Optional B-roll if you have time: re-run `verify` while offline
(`node dist/cli.js verify --offline`) and point at the `recorded` evidence label.

---

## Shot 3 — 1:35–2:20 · Rank by value, competition and deadline

**Run:**

```sh
node dist/cli.js rank --top 5
```

**Show:** the score column and the flags column (`discord_role_required`,
`verified_only`, `unpriced_asset`).

**Narration:**

> "Now rank them. The score is documented in the README: forty percent value,
> twenty-five percent competition, fifteen percent deadline urgency, and the rest
> for escrow trust and coverage. Value comes from the chain when it can be read.
>
> The Gibwork Developer Hackathon bounty scores 87.9 — a thousand USDC verified
> on-chain, zero submissions, six weeks left. The X-thread bounty is verified too,
> but a hundred and thirty-nine people are already on it."

---

## Shot 4 — 2:20–3:00 · What changed since the last capture

**Run:**

```sh
node dist/cli.js diff fixtures/bounties-20260911T173421Z.json snapshots/<newest>.json
```

(Or simply `node dist/cli.js diff`, which compares the newest capture with the
previous one.)

**Show:** `0 new, 1 gone, 2 changed, 7 unchanged`, the closed bounty, and the
submission-count moves.

**Narration:**

> "Snapshots are diffable. Between the committed baseline and this run, one
> bounty expired and dropped off the board, and two submission counts moved —
> including the CREDITS bounty, which went from unknown to a hundred and
> eighty-three entries.
>
> That is the loop: capture, verify, rank, diff. Point it at cron and you have a
> bounty radar that notices new money before the crowd does."

---

## Shot 5 — 3:00–3:35 · Export the deliverables

**Run:**

```sh
node dist/cli.js report --top 5
ls reports/<stamp>/
```

**Show:** the four generated files (`report.md`, `report.csv`, `report.json`,
`snapshot.json`, plus `diff.md`) and the top of `report.md`.

**Narration:**

> "`report` runs the whole pipeline once and writes Markdown for humans, CSV for
> spreadsheets, JSON for other tools, the full snapshot, and the diff. These are
> the exported artifacts in the repository."

---

## Shot 6 — 3:35–4:20 · The agent integration (MCP)

**Run (terminal 1):**

```sh
node dist/cli.js mcp
```

**Show:** it starts and waits on stdio. Then switch to Claude Code / Codex with
this registration:

```json
{ "mcpServers": { "escrow-sentinel": { "command": "node", "args": ["dist/cli.js", "mcp"] } } }
```

**Ask the agent:**

> "Which Gibwork bounties have verified escrow, low competition and at least
> seven days left? Use the gib_list_bounties tool."

**Show:** the JSON answer the agent receives (rank, value, coverage, flags).

**Narration:**

> "Escrow Sentinel is also an MCP server. Any MCP client — Claude Code, Codex,
> Cursor — can ask for Gibwork bounties and get chain-verified answers. It
> complements the official `@gibwork/mcp` server, which handles the authenticated
> write path: preparing, submitting and paying. This layer is the read-only
> analysis the agent needs before it recommends anything.
>
> Four tools ship today: `gib_list_bounties`, `gib_verify_escrow`,
> `gib_snapshot_diff` and `gib_report`. The whole thing is TypeScript, zero
> runtime dependencies, forty-five tests, MIT licensed."

**Close on:** `node --test` summary `pass 46 / fail 0`.

---

## Screenshots required by the bounty

Four are already committed in `screenshots/` (captured from real runs on
2026-09-11): `01-rank.png`, `02-discover.png`, `03-verify.png`, `04-tests.png`.
Capture the remaining three while recording the video:

1. `05-report.png` — the `report` output listing the generated files.
2. `06-review.png` — the top of `reports/<stamp>/report.md` in a pager/editor.
3. `07-mcp.png` — the MCP tool answer inside Claude Code / Codex.

Save them in `screenshots/` and link them from the README.

## Checklist before uploading the video

- [ ] The demo shows setup/execution **and** successful output (bounty requirement).
- [ ] No wallet, key or account appears on screen.
- [ ] The AI-assistance disclosure is mentioned in the close (or in the description),
      matching the README section.
- [ ] The repository link and the commit SHA shown in the video match what you publish.
