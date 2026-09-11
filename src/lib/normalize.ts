import type {
  AssetInfo,
  Bounty,
  BountyGating,
  BountyHealth,
  EscrowLedger,
  Snapshot,
} from '../types.js';
import { SCHEMA_VERSION, TOOL_NAME, TOOL_VERSION, toBool, toNumber, toStr, toStringArray } from './util.js';

export function emptyHealth(): BountyHealth {
  return {
    status: null,
    submissionCount: null,
    approvedCount: null,
    rejectedCount: null,
    pendingCount: null,
    rewardDensity: null,
    bountyUsd: null,
  };
}

export function emptyGating(): BountyGating {
  return {
    minSubmissionAmount: null,
    allowOnlyVerifiedSubmissions: null,
    minTwitterFollowers: null,
    maxSubmissions: null,
    requiredDiscordGuildId: null,
    requiredDiscordRoleIds: [],
    allowOnlyDiscordGuildSubmissions: null,
  };
}

export function emptyLedger(): EscrowLedger {
  return {
    address: null,
    balance: null,
    totalDeposited: null,
    totalWithdrawn: null,
    depositCount: null,
    withdrawalCount: null,
    symbol: null,
    mintAddress: null,
    isAccountClosed: null,
    lastActivityAt: null,
    lastActivityType: null,
    source: null,
  };
}

function normalizeAsset(raw: unknown): AssetInfo {
  const asset = (raw ?? {}) as Record<string, unknown>;
  return {
    symbol: toStr(asset.symbol) ?? 'UNKNOWN',
    mintAddress: toStr(asset.mintAddress),
    decimals: toNumber(asset.decimals),
    rawAmount: toStr(asset.amount),
    advertisedValue: toNumber(asset.price),
  };
}

export interface NormalizeOptions {
  capturedAt: string;
  note: string | null;
  source: 'live' | 'fixture';
  detailUrlTemplate?: string;
}

/** Map one `api.gib.work/explore` result entry onto the internal bounty model. */
export function normalizeExploreBounty(raw: unknown, options: NormalizeOptions): Bounty | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  const id = toStr(row.id);
  const title = toStr(row.title);
  if (!id || !title) return null;

  const user = (row.user ?? {}) as Record<string, unknown>;
  const template = options.detailUrlTemplate ?? 'https://gib.work/bounty/{id}';

  return {
    id,
    title,
    url: template.replace('{id}', id),
    content: toStr(row.content) ?? '',
    tags: toStringArray(row.tags),
    status: toStr(row.status),
    isOpen: toBool(row.isOpen),
    createdAt: null,
    deadline: toStr(row.deadline),
    creator: toStr(user.username),
    xpBonus: toNumber(row.xpBonus),
    asset: normalizeAsset(row.asset),
    advertisedPool: toNumber(row.remainingAmount),
    health: emptyHealth(),
    gating: {
      ...emptyGating(),
      allowOnlyVerifiedSubmissions: toBool(row.allowOnlyVerifiedSubmissions),
    },
    ledger: emptyLedger(),
    verification: null,
    provenance: { source: options.source, capturedAt: options.capturedAt, note: options.note },
  };
}

export interface ExplorePayloadMeta {
  total: number | null;
  page: number | null;
  lastPage: number | null;
  limit: number | null;
}

/** Parse the full explore payload, preserving listing metadata. */
export function normalizeExplorePayload(
  payload: unknown,
  options: NormalizeOptions,
): { bounties: Bounty[]; meta: ExplorePayloadMeta } {
  const body = (payload ?? {}) as Record<string, unknown>;
  const results = Array.isArray(body.results) ? body.results : [];
  const bounties = results
    .map((row) => normalizeExploreBounty(row, options))
    .filter((bounty): bounty is Bounty => bounty !== null);
  return {
    bounties,
    meta: {
      total: toNumber(body.total),
      page: toNumber(body.page),
      lastPage: toNumber(body.lastPage),
      limit: toNumber(body.limit),
    },
  };
}

export function createSnapshot(partial: {
  capturedAt: string;
  source: Snapshot['source'];
  warnings?: string[];
  bounties: Bounty[];
  snapshotId?: string;
}): Snapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    snapshotId: partial.snapshotId ?? `snap-${partial.capturedAt}`,
    capturedAt: partial.capturedAt,
    source: partial.source,
    warnings: partial.warnings ?? [],
    bounties: partial.bounties,
  };
}

export interface ExtractedDetail {
  health: BountyHealth | null;
  taskStatus: string | null;
  createdAt: string | null;
  deadline: string | null;
  minSubmissionAmount: number | null;
  allowOnlyVerifiedSubmissions: boolean | null;
  minTwitterFollowers: number | null;
  maxSubmissions: number | null;
  requiredDiscordGuildId: string | null;
  requiredDiscordRoleIds: string[];
  allowOnlyDiscordGuildSubmissions: boolean | null;
}

/** Extract the first balanced `{...}` object that follows `"key":` in `text`. */
function extractBalancedObject(text: string, key: string): unknown | null {
  const keyIndex = text.indexOf(key);
  if (keyIndex < 0) return null;
  const colonIndex = text.indexOf(':', keyIndex + key.length);
  if (colonIndex < 0) return null;
  let start = colonIndex + 1;
  while (start < text.length && /\s/.test(text[start] as string)) start += 1;
  if (text[start] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i] as string;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function firstNumber(text: string, key: string): number | null {
  const match = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text);
  return match ? toNumber(match[1]) : null;
}

function firstBool(text: string, key: string): boolean | null {
  const match = new RegExp(`"${key}"\\s*:\\s*(true|false)`).exec(text);
  return match ? match[1] === 'true' : null;
}

function firstString(text: string, key: string): string | null {
  const match = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(text);
  return match ? match[1] ?? null : null;
}

function nullableNumber(text: string, key: string): number | null {
  const match = new RegExp(`"${key}"\\s*:\\s*(null|-?\\d+(?:\\.\\d+)?)`).exec(text);
  if (!match || match[1] === 'null') return null;
  return toNumber(match[1]);
}

/**
 * The public bounty detail page embeds the task object inside its flight payload,
 * where quotes are escaped (`\"health\":{...}`). Unescape once and read the fields
 * we care about; anything that cannot be found stays null.
 */
export function extractDetailFromHtml(html: string): ExtractedDetail {
  const text = html.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\u0026/g, '&');

  const rawHealth = extractBalancedObject(text, '"health"') as Record<string, unknown> | null;
  let health: BountyHealth | null = null;
  if (rawHealth) {
    const metrics = (rawHealth.metrics ?? {}) as Record<string, unknown>;
    health = {
      status: toStr(rawHealth.status),
      submissionCount: toNumber(metrics.submissionCount),
      approvedCount: toNumber(metrics.approvedCount),
      rejectedCount: toNumber(metrics.rejectedCount),
      pendingCount: toNumber(metrics.pendingCount),
      rewardDensity: toNumber(metrics.rewardDensity),
      bountyUsd: toNumber(metrics.bountyUsd),
    };
  }

  // When a bounty expires the payload drops the `health` metrics object but keeps
  // the raw submission counters, so rebuild the health block from those.
  const countersIndex = text.indexOf('taskSubmissionsApprovedCount');
  const counters = countersIndex >= 0 ? text.slice(countersIndex) : '';
  const approved = firstNumber(counters, 'taskSubmissionsApprovedCount');
  const pending = firstNumber(counters, 'taskSubmissionsPendingCount');
  const rejected = firstNumber(counters, 'taskSubmissionsRejectedCount');
  // Task statuses are upper case (CREATED / CLOSED); health labels are lower case
  // (healthy / competitive), so an upper-case match can only be the task status.
  const taskStatus = /"status"\s*:\s*"([A-Z][A-Z_]{2,})"/.exec(counters)?.[1] ?? null;
  if (!health && (approved !== null || pending !== null || rejected !== null)) {
    health = {
      status: taskStatus,
      submissionCount: (approved ?? 0) + (pending ?? 0) + (rejected ?? 0),
      approvedCount: approved,
      rejectedCount: rejected,
      pendingCount: pending,
      rewardDensity: null,
      bountyUsd: null,
    };
  }

  const roleIds = /"requiredDiscordRoleIds"\s*:\s*\[([^\]]*)\]/.exec(text);

  return {
    health,
    taskStatus,
    createdAt: firstString(text, 'createdAt'),
    deadline: firstString(text, 'deadline'),
    minSubmissionAmount: nullableNumber(text, 'minSubmissionAmount') ?? firstNumber(text, 'minSubmissionAmount'),
    allowOnlyVerifiedSubmissions: firstBool(text, 'allowOnlyVerifiedSubmissions'),
    minTwitterFollowers: firstNumber(text, 'minTwitterFollowers'),
    maxSubmissions: nullableNumber(text, 'maxSubmissions'),
    requiredDiscordGuildId: firstString(text, 'requiredDiscordGuildId'),
    requiredDiscordRoleIds: roleIds ? toStringArray(JSON.parse(`[${roleIds[1] ?? ''}]`)) : [],
    allowOnlyDiscordGuildSubmissions: firstBool(text, 'allowOnlyDiscordGuildSubmissions'),
  };
}

/** Merge detail-page fields into a bounty without dropping anything already known. */
export function mergeDetail(bounty: Bounty, detail: ExtractedDetail): Bounty {
  const status = detail.taskStatus ?? bounty.status;
  return {
    ...bounty,
    status,
    // The detail page is authoritative about closure: the explore listing can still
    // show `isOpen: true` for a bounty whose deadline has just passed.
    isOpen: detail.taskStatus === 'CLOSED' ? false : bounty.isOpen,
    createdAt: detail.createdAt ?? bounty.createdAt,
    deadline: detail.deadline ?? bounty.deadline,
    health: detail.health ?? bounty.health,
    gating: {
      minSubmissionAmount: detail.minSubmissionAmount ?? bounty.gating.minSubmissionAmount,
      allowOnlyVerifiedSubmissions:
        detail.allowOnlyVerifiedSubmissions ?? bounty.gating.allowOnlyVerifiedSubmissions,
      minTwitterFollowers: detail.minTwitterFollowers ?? bounty.gating.minTwitterFollowers,
      maxSubmissions: detail.maxSubmissions ?? bounty.gating.maxSubmissions,
      requiredDiscordGuildId: detail.requiredDiscordGuildId ?? bounty.gating.requiredDiscordGuildId,
      requiredDiscordRoleIds:
        detail.requiredDiscordRoleIds.length > 0 ? detail.requiredDiscordRoleIds : bounty.gating.requiredDiscordRoleIds,
      allowOnlyDiscordGuildSubmissions:
        detail.allowOnlyDiscordGuildSubmissions ?? bounty.gating.allowOnlyDiscordGuildSubmissions,
    },
  };
}
