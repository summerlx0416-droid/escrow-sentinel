import readline from 'node:readline';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Config } from '../config.js';
import type { Bounty, EscrowVerification, Snapshot } from '../types.js';
import { diffSnapshots, renderDiffMarkdown } from '../lib/diff.js';
import { emptyGating, emptyHealth, emptyLedger } from '../lib/normalize.js';
import { buildReportJson } from '../lib/report.js';
import { rankBounties } from '../lib/score.js';
import { resolveSnapshotRef, type SnapshotRef } from '../lib/snapshot.js';
import { createRpcClient, type RpcClient } from '../lib/solana.js';
import { TOOL_NAME, TOOL_VERSION, errorMessage, nowIso, redactUrl, toStr } from '../lib/util.js';
import { verifyBounty } from '../lib/verify.js';
import { runPipeline } from '../lib/pipeline.js';

export const PROTOCOL_VERSION = '2025-06-18';
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2024-11-05'];

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolContext {
  config: Config;
  /** Test seams: inject a fake RPC or pipeline pieces. */
  rpcClient?: RpcClient | null;
  out?: (line: string) => void;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'gib_list_bounties',
    description:
      'Discover open Gibwork bounties (public listing API, fixture fallback), verify each escrow token account on Solana and rank them by value / competition / deadline. Read-only: no wallet, no signature, no submission.',
    inputSchema: {
      type: 'object',
      properties: {
        top: { type: 'number', description: 'How many ranked bounties to return (default: config top, max 50).' },
        min_value_usd: { type: 'number', description: 'Only return entries whose ranked value is at least this many USD.' },
        only_verified: { type: 'boolean', description: 'Only return bounties whose escrow matched the platform ledger.' },
        source: { type: 'string', enum: ['auto', 'live', 'fixture'], description: 'Discovery source (default: auto).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'gib_verify_escrow',
    description:
      'Read a Solana SPL token account with the public RPC (getAccountInfo jsonParsed + getTokenAccountBalance) and compare it with a bounty escrow or a raw address. Returns verified / mismatch / unknown.',
    inputSchema: {
      type: 'object',
      properties: {
        bounty_id: { type: 'string', description: 'Gibwork bounty id to look up in the latest snapshot.' },
        escrow_address: { type: 'string', description: 'Raw Solana token account address to verify.' },
        expected_amount: { type: 'number', description: 'Optional platform-stated balance to compare against.' },
        asset_symbol: { type: 'string', description: 'Optional advertised asset symbol (default USDC).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'gib_snapshot_diff',
    description:
      'Compare two Escrow Sentinel snapshots (defaults: newest capture vs the committed baseline) and report new bounties, closed bounties, escrow balance moves and submission-count changes.',
    inputSchema: {
      type: 'object',
      properties: {
        old: { type: 'string', description: 'Baseline snapshot path, or "latest" / "previous".' },
        new: { type: 'string', description: 'New snapshot path, or "latest" / "previous".' },
        format: { type: 'string', enum: ['markdown', 'json'], description: 'Response format (default markdown).' },
      },
      additionalProperties: false,
    },
  },
];

function ok(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text }] };
}

function fail(text: string): { content: Array<{ type: 'text'; text: string }>; isError: true } {
  return { content: [{ type: 'text', text }], isError: true };
}

function escrowSummary(verification: EscrowVerification) {
  return {
    status: verification.status,
    evidence: verification.evidence,
    escrowAddress: verification.escrowAddress,
    platformLedgerBalance: verification.platformLedgerBalance,
    onchainAmount: verification.onchainAmount,
    onchainMint: verification.onchainMint,
    decimals: verification.onchainDecimals,
    slot: verification.slot,
    coverage: verification.coverage,
    flags: verification.flags,
    reason: verification.reason,
    checkedAt: verification.checkedAt,
    rpcEndpoint: verification.rpcEndpoint,
  };
}

function syntheticBounty(address: string, options: { expectedAmount?: number | null; assetSymbol?: string }): Bounty {  const capturedAt = nowIso();
  return {
    id: `address:${address}`,
    title: `Escrow token account ${address}`,
    url: `https://explorer.solana.com/address/${address}`,
    content: '',
    tags: [],
    status: null,
    isOpen: null,
    createdAt: null,
    deadline: null,
    creator: null,
    xpBonus: null,
    asset: {
      symbol: options.assetSymbol ?? 'USDC',
      mintAddress: null,
      decimals: null,
      rawAmount: null,
      advertisedValue: options.expectedAmount ?? null,
    },
    advertisedPool: options.expectedAmount ?? null,
    health: emptyHealth(),
    gating: emptyGating(),
    ledger: {
      ...emptyLedger(),
      address,
      balance: options.expectedAmount ?? null,
      source: options.expectedAmount === undefined ? null : 'agent-supplied expectation',
    },
    verification: null,
    provenance: { source: 'live', capturedAt, note: 'direct escrow address check' },
  };
}

function unknownVerification(bounty: Bounty, reason: string): EscrowVerification {
  return {
    status: 'unknown',
    evidence: 'none',
    checkedAt: null,
    escrowAddress: bounty.ledger.address,
    rpcEndpoint: null,
    slot: null,
    platformLedgerBalance: bounty.ledger.balance,
    platformLedgerMint: bounty.ledger.mintAddress,
    platformLedgerSymbol: bounty.ledger.symbol,
    onchainAmount: null,
    onchainRawAmount: null,
    onchainDecimals: null,
    onchainMint: null,
    onchainOwner: null,
    mintMatchesLedger: null,
    assetMatchesAdvertised: null,
    coverage: null,
    flags: ['escrow_unchecked'],
    reason,
  };
}

/** Dispatch one `tools/call` request. Exported so tests can drive it without stdio. */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const config = ctx.config;
  try {
    switch (name) {
      case 'gib_list_bounties': {
        const requestedTop = typeof args.top === 'number' ? args.top : config.topN;
        const top = Math.max(1, Math.min(50, Math.floor(requestedTop)));
        const source = ['auto', 'live', 'fixture'].includes(String(args.source))
          ? (args.source as Config['source'])
          : config.source;
        const result = await runPipeline({ ...config, topN: top }, { source, rpcClient: ctx.rpcClient });
        let ranked = result.ranked;
        if (typeof args.min_value_usd === 'number') {
          const min = args.min_value_usd;
          ranked = ranked.filter((entry) => (entry.score.valueUsd ?? 0) >= min);
        }
        if (args.only_verified === true) {
          ranked = ranked.filter((entry) => entry.bounty.verification?.status === 'verified');
        }
        const payload = {
          snapshot: {
            snapshotId: result.snapshot.snapshotId,
            capturedAt: result.snapshot.capturedAt,
            source: result.snapshot.source,
          },
          verificationSummary: result.verification,
          ranking: ranked.map((entry) => ({
            rank: entry.rank,
            id: entry.bounty.id,
            title: entry.bounty.title,
            url: entry.bounty.url,
            asset: entry.bounty.asset.symbol,
            advertisedPool: entry.bounty.advertisedPool,
            deadline: entry.bounty.deadline,
            daysToDeadline: entry.score.daysToDeadline,
            valueUsd: entry.score.valueUsd,
            valueBasis: entry.score.valueBasis,
            submissions: entry.score.submissionCount,
            score: entry.score.score,
            escrow: escrowSummary(entry.bounty.verification ?? unknownVerification(entry.bounty, 'not verified in this run')),
            flags: entry.score.flags,
          })),
          warnings: result.warnings,
        };
        return ok(JSON.stringify(payload, null, 2));
      }

      case 'gib_verify_escrow': {
        const rpcClient = ctx.rpcClient ?? (config.rpcUrl ? createRpcClient({ url: config.rpcUrl, timeoutMs: config.timeoutMs }) : null);
        const address = toStr(args.escrow_address);
        const bountyId = toStr(args.bounty_id);

        if (!address && !bountyId) return fail('Provide either "bounty_id" or "escrow_address".');

        let bounty: Bounty | null = null;
        let note = '';
        if (address) {
          bounty = syntheticBounty(address, {
            expectedAmount: typeof args.expected_amount === 'number' ? args.expected_amount : undefined,
            assetSymbol: toStr(args.asset_symbol) ?? 'USDC',
          });
          note = 'verified directly from the supplied escrow address';
        } else if (bountyId) {
          const ref = resolveSnapshotRef('latest', config);
          const found = ref.snapshot.bounties.find((entry) => entry.id === bountyId || entry.id.startsWith(bountyId));
          if (!found) {
            return fail(
              `Bounty ${bountyId} is not in ${ref.path}. Run gib_list_bounties first, or pass an escrow_address.`,
            );
          }
          bounty = found;
          note = `bounty found in ${ref.path}`;
        }
        if (!bounty) return fail('No bounty resolved.');

        const verified = await verifyBounty(bounty, {
          rpcClient,
          vaultUrl: config.vaultUrl,
          vaultLookup: config.vaultLookup && !address,
          timeoutMs: config.timeoutMs,
          now: new Date(),
          reuseRecorded: false,
        });
        const payload = {
          note,
          bountyId: verified.id,
          title: verified.title,
          escrowAddress: verified.ledger.address,
          advertisedPool: verified.advertisedPool,
          assetSymbol: verified.asset.symbol,
          escrow: escrowSummary(verified.verification ?? unknownVerification(verified, 'verification did not run')),
        };
        return ok(JSON.stringify(payload, null, 2));
      }

      case 'gib_snapshot_diff': {
        const format = args.format === 'json' ? 'json' : 'markdown';
        let oldRef: SnapshotRef;
        let newRef: SnapshotRef;
        try {
          newRef = resolveSnapshotRef(toStr(args.new) ?? 'latest', config);
          oldRef = resolveSnapshotRef(toStr(args.old) ?? (toStr(args.new) ? 'latest' : 'previous'), config);
        } catch (error) {
          return fail(`Snapshot reference problem: ${errorMessage(error)}`);
        }
        const diff = diffSnapshots(oldRef.snapshot, newRef.snapshot, {
          oldPath: oldRef.path,
          newPath: newRef.path,
        });
        return ok(format === 'json' ? JSON.stringify(diff, null, 2) : renderDiffMarkdown(diff));
      }

      case 'gib_report': {
        // Convenience tool: same bundle the CLI writes, returned as JSON instead of files.
        const result = await runPipeline(config, { source: config.source, rpcClient: ctx.rpcClient });
        const payload = buildReportJson({
          command: 'mcp:gib_report',
          snapshot: result.snapshot,
          ranked: result.ranked,
          verification: result.verification,
          warnings: result.warnings,
          rpcEndpoint: result.rpcEndpoint,
          diff: result.diff,
          topN: config.topN,
          generatedAt: result.snapshot.capturedAt,
        });
        return ok(JSON.stringify(payload, null, 2));
      }

      default:
        return fail(`Unknown tool "${name}".`);
    }
  } catch (error) {
    return fail(`Tool "${name}" failed: ${errorMessage(error)}`);
  }
}

export const EXTRA_TOOL: ToolDefinition = {
  name: 'gib_report',
  description:
    'Run the full Escrow Sentinel pipeline (discover + escrow verification + ranking + diff) and return the complete report as JSON.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', enum: ['auto', 'live', 'fixture'] },
    },
    additionalProperties: false,
  },
};

export function listTools(): ToolDefinition[] {
  return [...TOOL_DEFINITIONS, EXTRA_TOOL];
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

/** Handle a single JSON-RPC message. Returns null for notifications. */
export async function handleMessage(message: JsonRpcRequest, ctx: ToolContext): Promise<Record<string, unknown> | null> {
  const id = message.id ?? null;
  const isNotification = message.id === undefined || message.id === null;
  const reply = (payload: Record<string, unknown>): Record<string, unknown> | null =>
    isNotification ? null : { jsonrpc: '2.0', id, ...payload };

  switch (message.method) {
    case 'initialize': {
      const requested = toStr((message.params as Record<string, unknown> | undefined)?.protocolVersion);
      const protocolVersion = requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSION;
      return reply({
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: TOOL_NAME, version: TOOL_VERSION },
        },
      });
    }
    case 'notifications/initialized':
    case 'initialized':
      return null;
    case 'ping':
      return reply({ result: {} });
    case 'tools/list':
      return reply({ result: { tools: listTools() } });
    case 'tools/call': {
      const params = message.params ?? {};
      const name = toStr(params.name) ?? '';
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const result = await callTool(name, args, ctx);
      return reply({ result });
    }
    default:
      return reply({ error: { code: -32601, message: `Method not found: ${message.method ?? '(missing)'}` } });
  }
}

function requireVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json') as { version?: string };
    return pkg.version ?? TOOL_VERSION;
  } catch {
    return TOOL_VERSION;
  }
}

export function serverCard(config: Config): Record<string, unknown> {
  const rel = (file: string): string => {
    const relative = path.relative(config.root, file);
    return relative === '' || relative.startsWith('..') ? file : relative.split(path.sep).join('/');
  };
  return {
    name: TOOL_NAME,
    version: requireVersion(),
    protocolVersion: PROTOCOL_VERSION,
    tools: listTools().map((tool) => tool.name),
    transport: 'stdio',
    readOnly: true,
    config: {
      source: config.offline ? `${config.source} (offline)` : config.source,
      exploreUrl: config.exploreUrl,
      vaultUrl: config.vaultUrl,
      rpcEndpoint: redactUrl(config.rpcUrl),
      fixturesDir: rel(config.fixturesDir),
      snapshotsDir: rel(config.snapshotsDir),
    },
  };
}

/** Newline-delimited JSON-RPC 2.0 loop on stdio. stdout carries protocol messages only. */
export async function runStdioServer(ctx: ToolContext): Promise<void> {
  const log = ctx.out ?? ((line: string) => process.stderr.write(`${line}\n`));
  log(`${TOOL_NAME} MCP server ready (stdio, read-only, ${listTools().length} tools)`);

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  const send = (payload: unknown): void => {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: `Parse error: ${errorMessage(error)}` } });
      continue;
    }
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    for (const message of messages) {
      try {
        const response = await handleMessage(message as JsonRpcRequest, ctx);
        if (response) send(response);
      } catch (error) {
        send({
          jsonrpc: '2.0',
          id: (message as JsonRpcRequest).id ?? null,
          error: { code: -32603, message: `Internal error: ${errorMessage(error)}` },
        });
      }
    }
  }
}

const helpText = `${TOOL_NAME} MCP server (stdio, read-only).

Usage:
  node dist/cli.js mcp [--source auto|live|fixture] [--rpc <url>] [--offline]

Tools:
${listTools()
  .map((tool) => `  - ${tool.name}: ${tool.description}`)
  .join('\n')}

Register with an MCP client (example for Claude Code / Codex style clients):
  { "mcpServers": { "escrow-sentinel": { "command": "node", "args": ["dist/cli.js", "mcp"] } } }
`;

export function mcpUsage(): string {
  return helpText;
}

export type { Snapshot };
