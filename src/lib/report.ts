import fs from 'node:fs';
import path from 'node:path';
import type { Bounty, Snapshot, SnapshotDiff } from '../types.js';
import type { VerifySummary } from './verify.js';
import { renderDiffMarkdown } from './diff.js';
import type { RankedBounty } from './score.js';
import { TOOL_NAME, TOOL_VERSION, formatAmount, formatPercent, nowIso } from './util.js';

export interface ReportInput {
  generatedAt?: string;
  snapshot: Snapshot;
  ranked: RankedBounty[];
  verification: VerifySummary | null;
  warnings: string[];
  rpcEndpoint: string | null;
  diff?: SnapshotDiff | null;
  topN: number;
  command: string;
}

function escrowCell(bounty: Bounty): string {
  const verification = bounty.verification;
  if (!verification) return 'unchecked';
  const coverage = verification.coverage === null ? '' : ` ${formatPercent(verification.coverage)}`;
  const flags = verification.flags.filter((flag) => !['coverage_partial', 'coverage_over'].includes(flag));
  return `${verification.status}${coverage}${flags.length > 0 ? ` (${flags.join('; ')})` : ''}`;
}

function deadlineCell(bounty: Bounty, ranked: RankedBounty | undefined): string {
  if (!bounty.deadline) return 'unknown';
  const days = ranked?.score.daysToDeadline;
  const dayLabel = days === null || days === undefined ? '' : ` (${days > 0 ? `in ${days}d` : 'passed'})`;
  return `${bounty.deadline.slice(0, 10)}${dayLabel}`;
}

/** Human readable Markdown report: ranking + escrow evidence + method notes. */
export function renderReportMarkdown(input: ReportInput): string {
  const generatedAt = input.generatedAt ?? nowIso();
  const lines: string[] = [];
  const snapshot = input.snapshot;
  const rankedById = new Map(input.ranked.map((entry) => [entry.bounty.id, entry]));

  lines.push('# Escrow Sentinel — Gibwork bounty report');
  lines.push('');
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Tool: ${TOOL_NAME} v${TOOL_VERSION}`);
  lines.push(`- Snapshot: ${snapshot.snapshotId} (captured ${snapshot.capturedAt}, source: ${snapshot.source.kind})`);
  lines.push(`- Discovery: ${snapshot.source.exploreUrl}`);
  lines.push(`- Escrow ledger: ${snapshot.source.vaultUrl}`);
  lines.push(`- Solana RPC: ${input.rpcEndpoint ?? 'disabled'}`);
  lines.push(`- Bounties in snapshot: ${snapshot.bounties.length} (ranked: ${input.ranked.length})`);
  if (input.verification) {
    lines.push(
      `- Escrow checks: ${input.verification.verified} verified / ${input.verification.mismatch} mismatch / ${input.verification.unknown} unknown`,
    );
  }
  lines.push('');

  lines.push(`## Top ${input.ranked.length} by value / competition / deadline`);
  lines.push('');
  lines.push('| # | Bounty | Asset | Value used | Escrow | Submissions | Deadline | Score |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const entry of input.ranked) {
    const { bounty, score } = entry;
    const value = score.valueUsd === null ? `— (${score.valueBasis})` : `${formatAmount(score.valueUsd)} ${bounty.asset.symbol} (${score.valueBasis})`;
    const submissions = score.submissionCount === null ? 'unknown' : String(score.submissionCount);
    lines.push(
      `| ${entry.rank} | [${bounty.title}](${bounty.url}) | ${bounty.asset.symbol} | ${value} | ${escrowCell(bounty)} | ${submissions} | ${deadlineCell(bounty, entry)} | ${score.score} |`,
    );
  }
  lines.push('');

  lines.push('## Escrow verification detail');
  lines.push('');
  lines.push('| Bounty | Escrow address | Platform ledger | On-chain | Status | Evidence | Flags |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const bounty of snapshot.bounties) {
    const v = bounty.verification;
    lines.push(
      `| ${bounty.title} | ${bounty.ledger.address ?? '—'} | ${formatAmount(v?.platformLedgerBalance ?? bounty.ledger.balance)} | ${
        v?.onchainAmount === null || v?.onchainAmount === undefined ? 'unknown' : formatAmount(v.onchainAmount)
      } | ${v?.status ?? 'unchecked'} | ${v?.evidence ?? 'none'}${v?.checkedAt ? ` (${v.checkedAt})` : ''} | ${v?.flags.join(', ') || '—'} |`,
    );
  }
  lines.push('');

  lines.push('## Score inputs');
  lines.push('');
  lines.push('| Bounty | value | competition | urgency | trust | coverage | value basis |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const entry of input.ranked) {
    const s = entry.score;
    lines.push(
      `| ${entry.bounty.title} | ${s.valueScore} | ${s.competitionScore} | ${s.urgencyScore} | ${s.trustScore} | ${s.coverageScore} | ${s.valueBasis} |`,
    );
  }
  lines.push('');

  if (input.diff) {
    lines.push('## Snapshot diff');
    lines.push('');
    for (const line of input.diff.summary) lines.push(`- ${line}`);
    lines.push('');
  }

  if (input.warnings.length > 0) {
    lines.push('## Run warnings');
    lines.push('');
    for (const warning of input.warnings) lines.push(`- ${warning}`);
    lines.push('');
    lines.push('');
  }

  lines.push('## Method');
  lines.push('');
  lines.push('1. `discover` — public listing API `api.gib.work/explore` (the endpoint the site itself calls); detail pages are fetched for submission counts.');
  lines.push('2. `verify` — the escrow token account is read with `getAccountInfo` (jsonParsed) and `getTokenAccountBalance` on a Solana RPC endpoint, then compared with the platform vault ledger.');
  lines.push('3. `rank` — the weighted score documented in `src/lib/score.ts` / README (value 40%, competition 25%, urgency 15%, escrow trust 10%, escrow coverage 10%).');
  lines.push('4. `diff` — the current capture is compared against the previous snapshot or the committed fixture.');
  lines.push('');
  lines.push('A failed RPC call degrades to `unknown`; the tool never fills a missing balance with a guess.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export const CSV_COLUMNS = [
  'rank',
  'id',
  'title',
  'url',
  'status',
  'is_open',
  'asset_symbol',
  'advertised_pool',
  'platform_ledger_balance',
  'onchain_amount',
  'value_usd',
  'value_basis',
  'coverage',
  'escrow_status',
  'escrow_flags',
  'submissions',
  'approved',
  'min_submission_amount',
  'deadline',
  'days_to_deadline',
  'score',
  'score_value',
  'score_competition',
  'score_urgency',
  'score_trust',
  'score_coverage',
] as const;

export function renderReportCsv(ranked: RankedBounty[]): string {
  const rows: string[] = [CSV_COLUMNS.join(',')];
  for (const entry of ranked) {
    const b = entry.bounty;
    const s = entry.score;
    const row: Record<(typeof CSV_COLUMNS)[number], unknown> = {
      rank: entry.rank,
      id: b.id,
      title: b.title,
      url: b.url,
      status: b.status,
      is_open: b.isOpen,
      asset_symbol: b.asset.symbol,
      advertised_pool: b.advertisedPool,
      platform_ledger_balance: b.verification?.platformLedgerBalance ?? b.ledger.balance,
      onchain_amount: b.verification?.onchainAmount ?? null,
      value_usd: s.valueUsd,
      value_basis: s.valueBasis,
      coverage: b.verification?.coverage ?? null,
      escrow_status: b.verification?.status ?? 'unchecked',
      escrow_flags: (b.verification?.flags ?? []).join('|'),
      submissions: s.submissionCount,
      approved: b.health.approvedCount,
      min_submission_amount: b.gating.minSubmissionAmount,
      deadline: b.deadline,
      days_to_deadline: s.daysToDeadline,
      score: s.score,
      score_value: s.valueScore,
      score_competition: s.competitionScore,
      score_urgency: s.urgencyScore,
      score_trust: s.trustScore,
      score_coverage: s.coverageScore,
    };
    rows.push(CSV_COLUMNS.map((column) => csvEscape(row[column])).join(','));
  }
  return `${rows.join('\n')}\n`;
}

/** Machine readable payload used by `--json` output and the MCP tools. */
export function buildReportJson(input: ReportInput): Record<string, unknown> {
  return {
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    command: input.command,
    generatedAt: input.generatedAt ?? nowIso(),
    snapshot: {
      snapshotId: input.snapshot.snapshotId,
      capturedAt: input.snapshot.capturedAt,
      source: input.snapshot.source,
      warnings: input.snapshot.warnings,
    },
    verificationSummary: input.verification,
    rpcEndpoint: input.rpcEndpoint,
    ranking: input.ranked.map((entry) => ({
      rank: entry.rank,
      id: entry.bounty.id,
      title: entry.bounty.title,
      url: entry.bounty.url,
      asset: entry.bounty.asset,
      advertisedPool: entry.bounty.advertisedPool,
      deadline: entry.bounty.deadline,
      submissions: entry.score.submissionCount,
      guildRoleRequired: (entry.bounty.gating.requiredDiscordRoleIds ?? []).length > 0,
      escrow: {
        address: entry.bounty.ledger.address,
        platformLedgerBalance: entry.bounty.verification?.platformLedgerBalance ?? entry.bounty.ledger.balance,
        onchainAmount: entry.bounty.verification?.onchainAmount ?? null,
        status: entry.bounty.verification?.status ?? 'unchecked',
        flags: entry.bounty.verification?.flags ?? [],
        coverage: entry.bounty.verification?.coverage ?? null,
        evidence: entry.bounty.verification?.evidence ?? 'none',
        checkedAt: entry.bounty.verification?.checkedAt ?? null,
        slot: entry.bounty.verification?.slot ?? null,
      },
      score: entry.score,
    })),
    bounties: input.snapshot.bounties,
    warnings: input.warnings,
  };
}

export interface WrittenReports {
  dir: string;
  files: { markdown: string; csv: string; json: string; snapshot: string; diff: string | null };
}

/** Write the Markdown / CSV / JSON bundle (plus the snapshot) into reports/<UTC stamp>/. */
export function writeReports(input: ReportInput, reportsDir: string): WrittenReports {
  const generatedAt = input.generatedAt ?? nowIso();
  const stamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dir = path.join(reportsDir, stamp);
  fs.mkdirSync(dir, { recursive: true });

  const markdown = path.join(dir, 'report.md');
  const csv = path.join(dir, 'report.csv');
  const json = path.join(dir, 'report.json');
  const snapshot = path.join(dir, 'snapshot.json');
  let diffPath: string | null = null;

  fs.writeFileSync(markdown, renderReportMarkdown({ ...input, generatedAt }), 'utf8');
  fs.writeFileSync(csv, renderReportCsv(input.ranked), 'utf8');
  fs.writeFileSync(json, `${JSON.stringify(buildReportJson({ ...input, generatedAt }), null, 2)}\n`, 'utf8');
  fs.writeFileSync(snapshot, `${JSON.stringify(input.snapshot, null, 2)}\n`, 'utf8');
  if (input.diff) {
    diffPath = path.join(dir, 'diff.md');
    fs.writeFileSync(diffPath, renderDiffMarkdown(input.diff), 'utf8');
  }

  return { dir, files: { markdown, csv, json, snapshot, diff: diffPath } };
}
