# Escrow Sentinel — Gibwork bounty report

- Generated: 2026-09-11T18:34:21Z
- Tool: escrow-sentinel v0.1.0
- Snapshot: snap-2026-09-11T18:34:21Z (captured 2026-09-11T18:34:21Z, source: live)
- Discovery: https://api.gib.work/explore?page=1
- Escrow ledger: https://api.gib.work/vaults
- Solana RPC: https://api.mainnet-beta.solana.com
- Bounties in snapshot: 9 (ranked: 5)
- Escrow checks: 9 verified / 0 mismatch / 0 unknown

## Top 5 by value / competition / deadline

| # | Bounty | Asset | Value used | Escrow | Submissions | Deadline | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [Gibwork Developer Hackathon Bounty](https://gib.work/bounty/1052f22d-3f87-4b1d-b0d7-71a60679e7fa) | USDC | 1000 USDC (onchain) | verified 100% | 0 | 2026-10-30 (in 48.39d) | 87.9 |
| 2 | [Create an X thread for Paid Requests](https://gib.work/bounty/53b0737a-3a6b-475b-a965-4a2a00016875) | USDC | 125 USDC (onchain) | verified 100% | 139 | 2026-09-12 (in 0.87d) | 63 |
| 3 | [Introduce Yourself to the Community](https://gib.work/bounty/b3735fc5-991c-45e6-aea0-8755314acb0c) | USDC | 120 USDC (onchain) | verified 100% | 49 | 2026-09-20 (in 8.88d) | 61 |
| 4 | [Share How You Actually Use BASIS Pick ONE Theme](https://gib.work/bounty/8d21b03d-1649-479c-91c7-b73023af08b3) | USDC | 145 USDC (onchain) | verified 100% | 216 | 2026-09-25 (in 13.57d) | 60.6 |
| 5 | [Axzra outreach Agent's Bounty ](https://gib.work/bounty/ce839876-bf1f-42b7-914b-dd59f8fea1fb) | USDC | 50 USDC (onchain) | verified 100% | 6 | 2026-09-18 (in 7.18d) | 59.5 |

## Escrow verification detail

| Bounty | Escrow address | Platform ledger | On-chain | Status | Evidence | Flags |
| --- | --- | --- | --- | --- | --- | --- |
| Gibwork Developer Hackathon Bounty | 9Nw5KFDj2vZsBJnQiYpKxpr9K2P1UkJGooLX9MtPWaEd | 1000 | 1000 | verified | live (2026-09-11T18:34:21Z) | — |
| Refer. Share. Win upto $300 USDC | 89rzwP3ReZj2DegybdayTsFGgEeAnAZvBYWre9PX5pmF | 120 | 120 | verified | live (2026-09-11T18:34:21Z) | coverage_partial, title_asset_hint_mismatch |
| Share How You Actually Use BASIS Pick ONE Theme | HB7hhgifuUXDtifSEmtQSshsbRNvoUHgNecoVCnyJ8sX | 145 | 145 | verified | live (2026-09-11T18:34:21Z) | — |
| Introduce Yourself to the Community | FWZiZ4FFiGV21xDZBoYoxV56SVHC9Z2XDsyCpovhcSsx | 120 | 120 | verified | live (2026-09-11T18:34:21Z) | — |
| Create an X thread for Paid Requests | CUAPvvnkJX6zs37cep7YrYqLpkTo1sC3nvfjupG1RfBY | 125 | 125 | verified | live (2026-09-11T18:34:21Z) | — |
| Axzra outreach Agent's Bounty  | 4eFyyg589rjVWwaHumXad7RjrmFyZYukspCbBmwytwue | 50 | 50 | verified | live (2026-09-11T18:34:21Z) | — |
| Write an X post about Velo (Hedera DeFi) | J1tVc7njjDaW8sF4x74mRedJwqR8TkQsb8bx4bBQZRXr | 4 | 4 | verified | live (2026-09-11T18:34:21Z) | — |
| Engage with @DHiveWorkng on Twitter/X | FD1pd5dJx6qtHfTKxLBUFgvCRPXu9VXQKTQfo3nTsJTu | 10 | 10 | verified | live (2026-09-11T18:34:21Z) | — |
| Flaunt your Verychat Login Streaks | 8QnzG972dQktNbEvYyogbkpg3gicY3vnoCFhGUmoGt2w | 4 | 4 | verified | live (2026-09-11T18:34:21Z) | — |

## Score inputs

| Bounty | value | competition | urgency | trust | coverage | value basis |
| --- | --- | --- | --- | --- | --- | --- |
| Gibwork Developer Hackathon Bounty | 1 | 1 | 0.1935 | 1 | 1 | onchain |
| Create an X thread for Paid Requests | 0.7 | 0.0071 | 0.9856 | 1 | 1 | onchain |
| Introduce Yourself to the Community | 0.6942 | 0.02 | 0.852 | 1 | 1 | onchain |
| Share How You Actually Use BASIS Pick ONE Theme | 0.7213 | 0.0046 | 0.7738 | 1 | 1 | onchain |
| Axzra outreach Agent's Bounty  | 0.5691 | 0.1429 | 0.8803 | 1 | 1 | onchain |

## Snapshot diff

- 0 new, 0 gone, 4 changed, 5 unchanged
- ~ Refer. Share. Win upto $300 USDC: submissionCount 185 -> 188
- ~ Share How You Actually Use BASIS Pick ONE Theme: submissionCount 214 -> 216
- ~ Write an X post about Velo (Hedera DeFi): submissionCount 134 -> 135
- ~ Engage with @DHiveWorkng on Twitter/X: submissionCount 30 -> 31

## Method

1. `discover` — public listing API `api.gib.work/explore` (the endpoint the site itself calls); detail pages are fetched for submission counts.
2. `verify` — the escrow token account is read with `getAccountInfo` (jsonParsed) and `getTokenAccountBalance` on a Solana RPC endpoint, then compared with the platform vault ledger.
3. `rank` — the weighted score documented in `src/lib/score.ts` / README (value 40%, competition 25%, urgency 15%, escrow trust 10%, escrow coverage 10%).
4. `diff` — the current capture is compared against the previous snapshot or the committed fixture.

A failed RPC call degrades to `unknown`; the tool never fills a missing balance with a guess.

