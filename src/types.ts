/**
 * Shared data model for Escrow Sentinel.
 *
 * Every field is either present with a real value or `null` meaning "unknown".
 * The pipeline never invents money: an unreadable escrow balance stays `null`
 * and is reported as `unknown` instead of being guessed.
 */

/** Result of comparing a platform ledger entry with the escrow token account on Solana. */
export type EscrowStatus = 'verified' | 'mismatch' | 'unknown';

/** Where a verification number came from. */
export type VerificationEvidence = 'live' | 'recorded' | 'none';

/** Asset advertised by the bounty listing. */
export interface AssetInfo {
  symbol: string;
  mintAddress: string | null;
  decimals: number | null;
  /** Raw integer amount in asset base units, as advertised by the platform. */
  rawAmount: string | null;
  /** Platform-stated value of the advertised pool (`asset.price`). */
  advertisedValue: number | null;
}

/** Platform ledger record for the bounty vault (from the public vault query endpoint). */
export interface EscrowLedger {
  address: string | null;
  balance: number | null;
  totalDeposited: number | null;
  totalWithdrawn: number | null;
  depositCount: number | null;
  withdrawalCount: number | null;
  symbol: string | null;
  mintAddress: string | null;
  isAccountClosed: boolean | null;
  lastActivityAt: string | null;
  lastActivityType: string | null;
  /** Provenance of this ledger record, e.g. `api.gib.work/vaults` or a fixture file. */
  source: string | null;
}

/** Independent on-chain verification of the escrow token account. */
export interface EscrowVerification {
  status: EscrowStatus;
  evidence: VerificationEvidence;
  checkedAt: string | null;
  escrowAddress: string | null;
  /** RPC endpoint in redacted form (scheme + host only, never a key). */
  rpcEndpoint: string | null;
  slot: number | null;
  platformLedgerBalance: number | null;
  platformLedgerMint: string | null;
  platformLedgerSymbol: string | null;
  onchainAmount: number | null;
  onchainRawAmount: string | null;
  onchainDecimals: number | null;
  onchainMint: string | null;
  onchainOwner: string | null;
  /** true/false when both mints are known, otherwise null. */
  mintMatchesLedger: boolean | null;
  /** true/false when the escrowed asset symbol equals the advertised symbol. */
  assetMatchesAdvertised: boolean | null;
  /** onchain amount / advertised pool, only computed when both are in the same asset unit. */
  coverage: number | null;
  flags: string[];
  reason: string | null;
}

export interface BountyHealth {
  status: string | null;
  submissionCount: number | null;
  approvedCount: number | null;
  rejectedCount: number | null;
  pendingCount: number | null;
  rewardDensity: number | null;
  bountyUsd: number | null;
}

export interface BountyGating {
  minSubmissionAmount: number | null;
  allowOnlyVerifiedSubmissions: boolean | null;
  minTwitterFollowers: number | null;
  maxSubmissions: number | null;
  requiredDiscordGuildId: string | null;
  requiredDiscordRoleIds: string[];
  allowOnlyDiscordGuildSubmissions: boolean | null;
}

export interface Provenance {
  /** `live` = fetched during this run, `fixture` = loaded from a committed snapshot. */
  source: 'live' | 'fixture' | 'unknown';
  capturedAt: string;
  /** Human readable note about the origin of the row (URL or evidence file). */
  note: string | null;
}

export interface Bounty {
  id: string;
  title: string;
  url: string;
  content: string;
  tags: string[];
  status: string | null;
  isOpen: boolean | null;
  createdAt: string | null;
  deadline: string | null;
  creator: string | null;
  xpBonus: number | null;
  asset: AssetInfo;
  /** Platform-advertised remaining pool (`remainingAmount`). */
  advertisedPool: number | null;
  health: BountyHealth;
  gating: BountyGating;
  ledger: EscrowLedger;
  verification: EscrowVerification | null;
  provenance: Provenance;
}

export interface SnapshotSource {
  kind: 'live' | 'fixture';
  exploreUrl: string;
  detailUrlTemplate: string;
  vaultUrl: string;
  /** Redacted RPC endpoint (scheme + host) or null when the snapshot has no RPC data. */
  rpcEndpoint: string | null;
  fixturePath: string | null;
  evidence: string | null;
}

export interface Snapshot {
  schemaVersion: number;
  tool: { name: string; version: string };
  snapshotId: string;
  capturedAt: string;
  source: SnapshotSource;
  warnings: string[];
  bounties: Bounty[];
}

export interface ChangedField {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface BountyChange {
  id: string;
  title: string;
  fields: ChangedField[];
}

export interface SnapshotDiff {
  generatedAt: string;
  old: { snapshotId: string; capturedAt: string; path: string | null; count: number };
  new: { snapshotId: string; capturedAt: string; path: string | null; count: number };
  added: Array<{ id: string; title: string; advertisedPool: number | null; escrowAddress: string | null }>;
  removed: Array<{ id: string; title: string; advertisedPool: number | null; escrowAddress: string | null }>;
  changed: BountyChange[];
  unchangedCount: number;
  summary: string[];
}
