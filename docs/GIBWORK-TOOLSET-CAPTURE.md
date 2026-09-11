# Gibwork toolset integration — capture (2026-09-11T18:40Z)

This file records a real side-by-side run performed on 2026-09-11 between
`@gibwork/mcp` (the official Gibwork MCP server, v0.3.0) and this project's own
read-only MCP server. Raw stdout is stored next to this file in
`captures/`.

## 1. Official `@gibwork/mcp` (read-only mode)

Command:

```bash
npx -y @gibwork/mcp --read-only
```

Handshake (`initialize`) and `tools/list` succeed and report:

```
serverInfo: {"name":"gibwork","version":"0.3.0"}
instructions: "This Gibwork server is intentionally read-only. ..."
tools: gibwork_wallet_status, gibwork_task_list, gibwork_task_available, ...
```

But **every data-bearing tool call fails without a wallet keypair**, including the
discovery tools:

```json
{"error":{"code":"CREDENTIAL_ERROR",
          "message":"No wallet configured. Set keypair-path in the selected Gibwork CLI profile, pass --keypair, or set GIBWORK_KEYPAIR_PATH."}}
```

Reproduced for `gibwork_wallet_status` and `gibwork_task_available` (page 1, limit 2/3)
on 2026-09-11T18:36–18:39Z. Raw captures: `captures/gibwork-mcp-wallet-status.txt`,
`captures/gibwork-mcp-task-available.txt`.

That is not a bug in the official server — it is a deliberate credential model.
It does mean an agent that only holds a **public** address (the normal case for a
bounty-triage assistant, a DAO reviewer, or a fresh machine) cannot use the
official server at all, and no tool in it will tell you whether a bounty's
advertised pool is actually still escrowed on-chain.

## 2. This project's MCP server (`escrow-sentinel mcp`)

Command:

```bash
node dist/cli.js mcp        # stdio, read-only, no wallet
```

Handshake:

```
initialize -> {"name":"escrow-sentinel","version":"0.1.0"}
tools/list -> gib_list_bounties, gib_verify_escrow, gib_snapshot_diff, gib_report
```

`gib_list_bounties` (top 3) executed at 2026-09-11T18:40:43Z returned a **live**
snapshot:

```json
{
  "snapshot": {"snapshotId": "snap-2026-09-11T18:40:43Z", "capturedAt": "2026-09-11T18:40:43Z",
    "source": {"kind": "live", "exploreUrl": "https://api.gib.work/explore?page=1",
               "vaultUrl": "https://api.gib.work/vaults",
               "rpcEndpoint": "https://api.mainnet-beta.solana.com"}},
  "verificationSummary": {"checked": 9, "verified": 9, "mismatch": 0, "unknown": 0}
}
```

i.e. nine bounties discovered from Gibwork's own public listing endpoint, each with
its Solana escrow token account read on-chain (`getAccountInfo` +
`getTokenAccountBalance`), and the Gibwork hackathon bounty itself ranked #1.
Raw capture: `captures/escrow-sentinel-mcp-probe.txt`.

## 3. What the two servers are for

| | official `@gibwork/mcp` | `escrow-sentinel mcp` |
|---|---|---|
| Credentials | wallet keypair required (writes + reads) | none — public addresses only |
| Escrow verification | no | yes (on-chain, per bounty: verified / mismatch / unknown) |
| Snapshot diff over time | no | yes (`gib_snapshot_diff`) |
| Report artifacts | no | yes (Markdown + CSV + JSON) |
| Writes / submissions | yes (with `--allow-writes`) | never |

They compose: use the official server to act on a bounty you are eligible for,
use Escrow Sentinel to decide **whether the money is really there and whether the
competition justifies the attempt** — before you spend a credit, a fee, or a wallet.

## 4. Environment

- Node v22 (`node --version`), npm 10, `npx -y @gibwork/mcp --read-only`
- Escrow Sentinel 0.1.0, TypeScript build committed in the repo (`npm run build`)
- Network: public endpoints only (`api.gib.work`, `api.mainnet-beta.solana.com`)
- No wallet, keypair, seed phrase or API key was created, requested or transmitted.
