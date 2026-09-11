# Escrow Sentinel — architecture

Escrow Sentinel is a read-only command line tool plus MCP server that answers one
question for a developer, an operator or an AI agent:

> Which Gibwork bounties actually have money behind them, how crowded are they,
> and which ones are worth doing right now?

Nothing in the pipeline signs a transaction, holds a key or touches an account.

## Module map

```
src/
  cli.ts                command line entry point (discover/verify/rank/diff/report/mcp/tools)
  config.ts             flags + env + paths, source mode (auto/live/fixture), offline switch
  types.ts              Bounty / Snapshot / EscrowVerification / SnapshotDiff data model
  lib/
    util.ts             time, numbers, URL redaction, fetch with timeout + retry
    normalize.ts        explore payload -> Bounty, detail-page (flight payload) field extraction
    discover.ts         discovery layer, fixture replay, fallback, detail enrichment, snapshot I/O
    vaults.ts           escrow address + ledger via the public vault query
    solana.ts           JSON-RPC reads: getAccountInfo (jsonParsed), getTokenAccountBalance
    verify.ts           platform ledger vs on-chain account comparison, status + flags
    score.ts            weighted scoring, value resolution, ranking
    diff.ts             snapshot vs snapshot changes
    report.ts           Markdown / CSV / JSON renderers and the report writer
    snapshot.ts         snapshot references (path, latest, previous)
    pipeline.ts         discover -> verify -> rank -> diff in one call
    table.ts            terminal table renderer
  mcp/
    server.ts           MCP stdio JSON-RPC server + tool definitions + dispatcher
scripts/
  build-fixture-from-evidence.mjs   rebuild fixtures/ from the captured evidence
test/                  46 node:test cases (unit + subprocess integration)
```

## Data flow

```
                      ┌──────────────────────────────────────────┐
                      │  api.gib.work/explore?page=1   (public)  │
                      └───────────────┬──────────────────────────┘
                                      │ GET
                                      ▼
   gib.work/bounty/<id>  ──GET──▶  discover  ──▶ Snapshot{ bounties[] }  ──▶ snapshots/bounties-<UTC>.json
   (detail flight payload)           │                                        │
                                     │                                        │ baseline for diff
                                     ▼                                        ▼
                     api.gib.work/vaults (public vault query)  ──▶  EscrowLedger (address, balance, activity)
                                     │                                        │
                                     ▼                                        ▼
              Solana RPC getAccountInfo / getTokenAccountBalance  ──▶  EscrowVerification
                                                                          verified | mismatch | unknown
                                     │
                                     ▼
                                   verify  ──▶  Snapshot (with evidence)
                                     │
                                     ▼
                                   rank    ──▶  score = f(value, competition, urgency, trust, coverage)
                                     │
                                     ▼
                                 report   ──▶  reports/<UTC>/{report.md, report.csv, report.json, snapshot.json, diff.md}
                                     │
                                     ▼
                                    mcp    ──▶  gib_list_bounties / gib_verify_escrow / gib_snapshot_diff / gib_report
```

## Design rules

1. **Read-only.** Only `GET` on public pages, one read-only JSON query to the public
   vault endpoint (the same call the bounty page makes to render its escrow card),
   and read-only Solana RPC methods. No keypair, no signature, no transaction.
2. **Never invent money.** A value is either read from the chain, stated by the
   platform, or `null`. `null` becomes `unknown`; it is never converted into a
   number. Assets without a USD peg (for example platform credits) are reported as
   `unpriced_asset` and score zero on value instead of using an invented rate.
3. **Degrade, do not crash.** A timeout, HTTP 429 or malformed payload marks the
   row `unknown` with a machine readable `reason` and flag, and the rest of the
   run continues. `--source auto` falls back from the live listing to the
   committed fixture.
4. **Evidence is labelled.** Every verification carries `evidence: live | recorded`
   plus the capture/check timestamp, so a replayed fixture can never be mistaken
   for a fresh on-chain read.
5. **Deterministic output.** Sorting breaks ties on bounty id, snapshots are
   written with stable key order and file names carry UTC stamps, so two runs on
   the same inputs are byte-identical (except capture time).
6. **No secret leakage.** RPC endpoints are redacted to `scheme://host` before they
   reach a report, a JSON export or an MCP response.

## Escrow verification semantics

```
platform vault record  ──┐
                         ├──► equal  ──► verified (+ coverage = onchain / advertised pool)
on-chain token account ──┘
                         └──► differ ──► mismatch  (flag: ledger_mismatch)

RPC failed / account missing / no escrow address ──► unknown (flag: rpc_error,
                                                     escrow_account_not_found,
                                                     vault_lookup_failed,
                                                     escrow_address_unknown,
                                                     rpc_disabled)
```

Extra flags: `asset_label_mismatch` (advertised symbol ≠ escrowed symbol),
`title_asset_hint_mismatch` (title mentions USDC/USDT while the listing asset is
something else), `coverage_partial` / `coverage_over` (escrow covers less / more
than the advertised pool), `mint_mismatch`, `balance_only` (only the balance
method answered).

## Extension points

- `src/lib/discover.ts` — add a discovery adapter (for example consuming the
  official `@gibwork/mcp` `gibwork_task_list` tool) by returning the same
  normalized `Bounty[]` shape.
- `src/lib/score.ts` — weights live in one `WEIGHTS` constant; add factors
  (gating, Discord role requirements, min submission amount) without touching the
  pipeline.
- `src/lib/verify.ts` — any object implementing `RpcClient` can be injected, which
  is how the tests simulate rate limiting and missing accounts.
- `src/mcp/server.ts` — tools are declared in one array and dispatched by name.
