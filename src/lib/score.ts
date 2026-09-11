import type { Bounty, EscrowStatus } from '../types.js';
import { clamp, daysBetween, parseIso, round } from './util.js';

/**
 * Ranking formula (also documented in README.md):
 *
 *   valueScore       = clamp( log10(1 + verifiedValueUsd) / log10(1 + 1000), 0, 1 )
 *   competitionScore = 1 / (1 + submissionCount)                 (0 submissions -> 1.0)
 *   urgencyScore     = clamp( (60 - daysToDeadline) / 60, 0, 1 ) (deadline today -> 1.0)
 *   trustScore       = verified -> 1.0 | unchecked -> 0.5 | mismatch -> 0.1
 *   coverageScore    = clamp(onchainAmount / advertisedPool, 0, 1), 0.5 when not comparable
 *
 *   score = 100 * (0.40*value + 0.25*competition + 0.15*urgency + 0.10*trust + 0.10*coverage)
 *
 * Money is only counted when it is either read from the escrow token account
 * (`onchain`) or stated by the platform for a USD-pegged asset (`platform`).
 * Assets with no USD peg (e.g. platform credits) stay `unpriced_asset` and score
 * zero on value instead of being converted with an invented rate.
 */
export const WEIGHTS = {
  value: 0.4,
  competition: 0.25,
  urgency: 0.15,
  trust: 0.1,
  coverage: 0.1,
} as const;

export const VALUE_CEILING_USD = 1000;
export const URGENCY_WINDOW_DAYS = 60;
const USD_PEGGED = new Set(['USDC', 'USDT', 'PYUSD', 'USDG', 'USDS']);

export type ValueBasis = 'onchain' | 'platform' | 'unpriced_asset' | 'none';

export interface ScoreParts {
  score: number;
  valueScore: number;
  competitionScore: number;
  urgencyScore: number;
  trustScore: number;
  coverageScore: number;
  valueUsd: number | null;
  valueBasis: ValueBasis;
  coverage: number | null;
  daysToDeadline: number | null;
  submissionCount: number | null;
  trust: EscrowStatus | 'unchecked';
  flags: string[];
}

export interface RankedBounty {
  rank: number;
  bounty: Bounty;
  score: ScoreParts;
}

export function isUsdPegged(symbol: string | null | undefined): boolean {
  return !!symbol && USD_PEGGED.has(symbol.trim().toUpperCase());
}

/** Value we are willing to rank on, and where that number came from. */
export function resolveValue(bounty: Bounty): { valueUsd: number | null; basis: ValueBasis } {
  const verification = bounty.verification;
  if (verification && verification.onchainAmount !== null && isUsdPegged(bounty.asset.symbol)) {
    return { valueUsd: verification.onchainAmount, basis: 'onchain' };
  }
  if (isUsdPegged(bounty.asset.symbol) && bounty.advertisedPool !== null) {
    return { valueUsd: bounty.advertisedPool, basis: 'platform' };
  }
  if (!isUsdPegged(bounty.asset.symbol)) return { valueUsd: null, basis: 'unpriced_asset' };
  return { valueUsd: null, basis: 'none' };
}

export function scoreBounty(bounty: Bounty, now: Date = new Date()): ScoreParts {
  const flags: string[] = [];
  const { valueUsd, basis } = resolveValue(bounty);

  const valueScore = valueUsd === null ? 0 : clamp(Math.log10(1 + valueUsd) / Math.log10(1 + VALUE_CEILING_USD), 0, 1);

  const submissionCount = bounty.health?.submissionCount ?? null;
  const competitionScore = submissionCount === null ? 0.5 : 1 / (1 + Math.max(0, submissionCount));
  if (submissionCount === null) flags.push('competition_unknown');

  const deadline = parseIso(bounty.deadline);
  const daysToDeadline = deadline ? daysBetween(now, deadline) : null;
  const urgencyScore = daysToDeadline === null ? 0.3 : clamp((URGENCY_WINDOW_DAYS - daysToDeadline) / URGENCY_WINDOW_DAYS, 0, 1);
  if (daysToDeadline === null) flags.push('deadline_unknown');

  const status = bounty.verification?.status ?? null;
  const trust: EscrowStatus | 'unchecked' = status ?? 'unchecked';
  const trustScore = trust === 'verified' ? 1 : trust === 'mismatch' ? 0.1 : 0.5;
  if (trust === 'unchecked') flags.push('escrow_unchecked');
  if (trust === 'mismatch') flags.push('escrow_mismatch');
  if (bounty.verification?.flags.includes('coverage_partial')) flags.push('escrow_partially_funded');
  if (bounty.gating.allowOnlyVerifiedSubmissions === true) flags.push('verified_only');
  if ((bounty.gating.requiredDiscordRoleIds?.length ?? 0) > 0) flags.push('discord_role_required');
  if (bounty.gating.allowOnlyDiscordGuildSubmissions === true) flags.push('discord_guild_only');
  if (basis === 'unpriced_asset') flags.push('unpriced_asset');
  if (bounty.isOpen === false) flags.push('closed');

  const coverage = bounty.verification?.coverage ?? null;
  const coverageScore = coverage === null ? 0.5 : clamp(coverage, 0, 1);

  const score =
    100 *
    (WEIGHTS.value * valueScore +
      WEIGHTS.competition * competitionScore +
      WEIGHTS.urgency * urgencyScore +
      WEIGHTS.trust * trustScore +
      WEIGHTS.coverage * coverageScore);

  return {
    score: round(score, 1),
    valueScore: round(valueScore, 4),
    competitionScore: round(competitionScore, 4),
    urgencyScore: round(urgencyScore, 4),
    trustScore: round(trustScore, 4),
    coverageScore: round(coverageScore, 4),
    valueUsd: valueUsd === null ? null : round(valueUsd, 6),
    valueBasis: basis,
    coverage: coverage === null ? null : round(coverage, 4),
    daysToDeadline: daysToDeadline === null ? null : round(daysToDeadline, 2),
    submissionCount,
    trust,
    flags: Array.from(new Set(flags)),
  };
}

/** Rank bounties by score (descending). Ties break on id so runs stay reproducible. */
export function rankBounties(
  bounties: Bounty[],
  options: { now?: Date; top?: number | null; onlyOpen?: boolean } = {},
): RankedBounty[] {
  const now = options.now ?? new Date();
  const filtered = options.onlyOpen === false ? bounties : bounties.filter((b) => b.isOpen !== false);
  const scored = filtered.map((bounty) => ({ bounty, score: scoreBounty(bounty, now) }));
  scored.sort((a, b) => {
    if (b.score.score !== a.score.score) return b.score.score - a.score.score;
    return a.bounty.id < b.bounty.id ? -1 : a.bounty.id > b.bounty.id ? 1 : 0;
  });
  const limited = options.top && options.top > 0 ? scored.slice(0, options.top) : scored;
  return limited.map((entry, index) => ({ rank: index + 1, bounty: entry.bounty, score: entry.score }));
}
