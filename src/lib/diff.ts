import type { Bounty, ChangedField, Snapshot, SnapshotDiff } from '../types.js';
import { formatAmount, nowIso } from './util.js';

interface FieldSpec {
  field: string;
  get: (bounty: Bounty) => string | number | boolean | null;
}

/** Fields that are worth watching between two captures. */
export const DIFF_FIELDS: FieldSpec[] = [
  { field: 'advertisedPool', get: (b) => b.advertisedPool },
  { field: 'escrowAddress', get: (b) => b.ledger.address },
  { field: 'ledgerBalance', get: (b) => b.ledger.balance },
  { field: 'ledgerTotalWithdrawn', get: (b) => b.ledger.totalWithdrawn },
  { field: 'onchainAmount', get: (b) => b.verification?.onchainAmount ?? null },
  { field: 'verificationStatus', get: (b) => b.verification?.status ?? null },
  { field: 'submissionCount', get: (b) => b.health.submissionCount },
  { field: 'approvedCount', get: (b) => b.health.approvedCount },
  { field: 'status', get: (b) => b.status },
  { field: 'isOpen', get: (b) => b.isOpen },
  { field: 'deadline', get: (b) => b.deadline },
  { field: 'assetSymbol', get: (b) => b.asset.symbol },
];

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return false;
}

function short(bounty: Bounty): { id: string; title: string; advertisedPool: number | null; escrowAddress: string | null } {
  return {
    id: bounty.id,
    title: bounty.title,
    advertisedPool: bounty.advertisedPool,
    escrowAddress: bounty.ledger.address,
  };
}

/**
 * Compare two snapshots (typically the committed fixture versus a fresh capture)
 * and report new bounties, vanished bounties and field-level changes.
 */
export function diffSnapshots(
  oldSnapshot: Snapshot,
  newSnapshot: Snapshot,
  paths: { oldPath?: string | null; newPath?: string | null; generatedAt?: string } = {},
): SnapshotDiff {
  const oldMap = new Map(oldSnapshot.bounties.map((bounty) => [bounty.id, bounty]));
  const newMap = new Map(newSnapshot.bounties.map((bounty) => [bounty.id, bounty]));

  const added = newSnapshot.bounties.filter((b) => !oldMap.has(b.id)).map(short);
  const removed = oldSnapshot.bounties.filter((b) => !newMap.has(b.id)).map(short);
  const changed = [];

  for (const [id, after] of newMap) {
    const before = oldMap.get(id);
    if (!before) continue;
    const fields: ChangedField[] = [];
    for (const spec of DIFF_FIELDS) {
      const beforeValue = spec.get(before);
      const afterValue = spec.get(after);
      if (!valuesEqual(beforeValue, afterValue)) {
        fields.push({ field: spec.field, before: beforeValue, after: afterValue });
      }
    }
    if (fields.length > 0) changed.push({ id, title: after.title, fields });
  }

  const summary: string[] = [];
  summary.push(`${added.length} new, ${removed.length} gone, ${changed.length} changed, ${newMap.size - added.length - changed.length} unchanged`);
  for (const entry of added) {
    summary.push(`+ added: ${entry.title} (pool ${formatAmount(entry.advertisedPool)})`);
  }
  for (const entry of removed) {
    summary.push(`- closed/removed: ${entry.title} (pool ${formatAmount(entry.advertisedPool)})`);
  }
  for (const entry of changed) {
    const parts = entry.fields.map((f) => `${f.field} ${f.before ?? 'null'} -> ${f.after ?? 'null'}`);
    summary.push(`~ ${entry.title}: ${parts.join('; ')}`);
  }

  return {
    generatedAt: paths.generatedAt ?? nowIso(),
    old: {
      snapshotId: oldSnapshot.snapshotId,
      capturedAt: oldSnapshot.capturedAt,
      path: paths.oldPath ?? null,
      count: oldSnapshot.bounties.length,
    },
    new: {
      snapshotId: newSnapshot.snapshotId,
      capturedAt: newSnapshot.capturedAt,
      path: paths.newPath ?? null,
      count: newSnapshot.bounties.length,
    },
    added,
    removed,
    changed,
    unchangedCount: newMap.size - added.length - changed.length,
    summary,
  };
}

/** Render a diff as Markdown for reports and MCP responses. */
export function renderDiffMarkdown(diff: SnapshotDiff): string {
  const lines: string[] = [];
  lines.push('# Escrow Sentinel — snapshot diff');
  lines.push('');
  lines.push(`- Generated: ${diff.generatedAt}`);
  lines.push(`- Old: ${diff.old.snapshotId} (${diff.old.capturedAt}) — ${diff.old.count} bounties`);
  lines.push(`- New: ${diff.new.snapshotId} (${diff.new.capturedAt}) — ${diff.new.count} bounties`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  for (const line of diff.summary) lines.push(`- ${line}`);
  lines.push('');
  if (diff.changed.length > 0) {
    lines.push('## Changed fields');
    lines.push('');
    lines.push('| Bounty | Field | Before | After |');
    lines.push('| --- | --- | --- | --- |');
    for (const change of diff.changed) {
      for (const field of change.fields) {
        lines.push(`| ${change.title} | ${field.field} | ${field.before ?? '—'} | ${field.after ?? '—'} |`);
      }
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
