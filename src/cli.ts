#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeConfig, loadConfig, type Config } from './config.js';
import { diffSnapshots, renderDiffMarkdown } from './lib/diff.js';
import { discoverBounties, writeSnapshotFile } from './lib/discover.js';
import { discoverOptionsFromConfig, runPipeline } from './lib/pipeline.js';
import { buildReportJson, writeReports } from './lib/report.js';
import { rankBounties } from './lib/score.js';
import { loadInputSnapshot, resolveSnapshotRef, type SnapshotRef } from './lib/snapshot.js';
import { createRpcClient, type RpcClient } from './lib/solana.js';
import { renderTable } from './lib/table.js';
import { TOOL_NAME, TOOL_VERSION, errorMessage, flagBool, formatAmount, formatPercent, redactUrl } from './lib/util.js';
import { verifySnapshot } from './lib/verify.js';
import { mcpUsage, runStdioServer, serverCard } from './mcp/server.js';

const HELP = `${TOOL_NAME} v${TOOL_VERSION} — read-only Gibwork bounty radar with on-chain escrow checks.

Usage: node dist/cli.js <command> [options]

Commands:
  discover   Fetch the public Gibwork bounty listing (fixture fallback) and save a snapshot.
  verify     Read every escrow token account on Solana and compare it with the platform ledger.
  rank       Score and rank the bounties in the newest snapshot (value / competition / deadline).
  diff       Compare two snapshots (default: previous vs latest) and print the changes.
  report     discover + verify + rank + diff, writing report.md / report.csv / report.json.
  mcp        Start the read-only MCP stdio server (gib_list_bounties, gib_verify_escrow, gib_snapshot_diff, gib_report).
  tools      Print the MCP server card (tool list + effective config) as JSON.
  help       Show this text.

Options:
  --source <auto|live|fixture>  Discovery source (default auto: live API, fixture fallback).
  --fixture <path>              Explicit fixture/snapshot file to read.
  --snapshot <path>             Explicit snapshot file to read (verify/rank).
  --rpc <url>                   Solana RPC endpoint (default https://api.mainnet-beta.solana.com).
  --no-rpc                      Do not call any RPC endpoint.
  --offline                     No network at all: replay the fixture and the verifications already stored in the snapshot.
  --enrich / --no-enrich        Fetch bounty detail pages for submission counts (default on).
  --vault / --no-vault          Resolve escrow addresses via the public vault endpoint (default on).
  --top <n>                     Number of ranked rows (default 5).
  --limit <n>                   Limit rows returned by discovery.
  --now <iso>                   Fix "now" for deterministic scoring.
  --json                        Machine readable output on stdout.
  --out <path>                  Write diff/json output to a file.
  --out-dir <dir>               Report output directory (default reports/).
`;

interface Runtime {
  config: Config;
  flags: Record<string, string | boolean>;
  positionals: string[];
  rpcClient: RpcClient | null;
  out: (line: string) => void;
  json: boolean;
}

function buildRpcClient(config: Config): RpcClient | null {
  if (!config.rpcUrl) return null;
  return createRpcClient({ url: config.rpcUrl, timeoutMs: config.timeoutMs, retries: 1 });
}

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

/** Paths inside the project are printed relative to the project root, with `/` separators. */
function rel(config: Config, file: string): string {
  const relative = path.relative(config.root, file);
  if (relative === '' || relative.startsWith('..')) return file;
  return relative.split(path.sep).join('/');
}

async function cmdDiscover(runtime: Runtime): Promise<number> {
  const { config, json, out } = runtime;
  if (!json) {
    out(`${TOOL_NAME} v${TOOL_VERSION} — discover`);
    out(describeConfig(config, redactUrl(config.rpcUrl)));
  }
  const result = await discoverBounties(discoverOptionsFromConfig(config));
  const saved = writeSnapshotFile(result.snapshot, config.snapshotsDir);

  if (json) {
    printJson({
      snapshotId: result.snapshot.snapshotId,
      capturedAt: result.snapshot.capturedAt,
      origin: result.origin,
      usedFallback: result.usedFallback,
      saved,
      warnings: result.warnings,
      bounties: result.snapshot.bounties,
    });
    return 0;
  }

  out(`snapshot   ${result.snapshot.snapshotId}  origin=${result.origin}  rows=${result.snapshot.bounties.length}`);
  out(`saved      ${rel(config, saved)}`);
  if (result.warnings.length > 0) for (const warning of result.warnings) out(`warning    ${warning}`);
  out('');
  out(
    renderTable(
      ['ID', 'Title', 'Asset', 'Pool', 'Submissions', 'Deadline'],
      result.snapshot.bounties.map((bounty) => [
        bounty.id.slice(0, 8),
        bounty.title,
        bounty.asset.symbol,
        formatAmount(bounty.advertisedPool),
        bounty.health.submissionCount === null ? 'unknown' : String(bounty.health.submissionCount),
        bounty.deadline ? bounty.deadline.slice(0, 10) : 'unknown',
      ]),
    ),
  );
  return 0;
}

async function cmdVerify(runtime: Runtime): Promise<number> {
  const { config, json, out, rpcClient } = runtime;
  const ref = loadInputSnapshot(config);
  if (!json) {
    const rpcLabel = rpcClient
      ? config.offline
        ? `${rpcClient.endpoint} (offline: recorded evidence replayed)`
        : rpcClient.endpoint
      : 'disabled';
    out(`${TOOL_NAME} v${TOOL_VERSION} — verify`);
    out(`snapshot   ${rel(config, ref.path)}`);
    out(`rpc        ${rpcLabel}`);
  }
  const verified = await verifySnapshot(ref.snapshot, {
    rpcClient,
    vaultUrl: config.vaultUrl,
    vaultLookup: config.vaultLookup,
    timeoutMs: config.timeoutMs,
    now: config.now,
    reuseRecorded: config.offline || rpcClient === null,
  });
  const saved = writeSnapshotFile(verified.snapshot, config.snapshotsDir);

  if (json) {
    printJson({
      snapshot: ref.path,
      saved,
      summary: verified.summary,
      bounties: verified.snapshot.bounties.map((bounty) => ({
        id: bounty.id,
        title: bounty.title,
        escrowAddress: bounty.ledger.address,
        verification: bounty.verification,
      })),
    });
    return 0;
  }

  out('');
  out(
    renderTable(
      ['Status', 'Bounty', 'Platform', 'On-chain', 'Coverage', 'Flags'],
      verified.snapshot.bounties.map((bounty) => [
        bounty.verification?.status ?? 'unchecked',
        bounty.title,
        bounty.verification?.platformLedgerBalance === null || bounty.verification?.platformLedgerBalance === undefined
          ? formatAmount(bounty.ledger.balance)
          : formatAmount(bounty.verification.platformLedgerBalance),
        bounty.verification?.onchainAmount === null || bounty.verification?.onchainAmount === undefined
          ? 'unknown'
          : `${formatAmount(bounty.verification.onchainAmount)} ${bounty.ledger.symbol ?? bounty.asset.symbol}`,
        formatPercent(bounty.verification?.coverage ?? null, 0),
        bounty.verification?.flags.join(', ') || (bounty.verification?.reason ?? '—'),
      ]),
    ),
  );
  out('');
  out(
    `summary    ${verified.summary.verified} verified / ${verified.summary.mismatch} mismatch / ${verified.summary.unknown} unknown  (of ${verified.summary.checked})`,
  );
  out(`saved      ${rel(config, saved)}`);
  return 0;
}

async function cmdRank(runtime: Runtime): Promise<number> {
  const { config, json, out } = runtime;
  const ref = loadInputSnapshot(config);
  const ranked = rankBounties(ref.snapshot.bounties, { now: config.now, top: config.topN });

  if (json) {
    printJson({
      snapshot: ref.path,
      generatedAt: config.now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      ranking: ranked.map((entry) => ({
        rank: entry.rank,
        id: entry.bounty.id,
        title: entry.bounty.title,
        url: entry.bounty.url,
        score: entry.score,
        escrowStatus: entry.bounty.verification?.status ?? 'unchecked',
      })),
    });
    return 0;
  }

  out(`${TOOL_NAME} v${TOOL_VERSION} — rank (top ${ranked.length} of ${ref.snapshot.bounties.length})`);
  out(`snapshot   ${rel(config, ref.path)}`);
  out(`formula    score = 100 * (0.40*value + 0.25*competition + 0.15*urgency + 0.10*trust + 0.10*coverage)`);
  out('');
  out(
    renderTable(
      ['#', 'Score', 'Bounty', 'Value used', 'Subs', 'Deadline', 'Escrow', 'Flags'],
      ranked.map((entry) => [
        String(entry.rank),
        entry.score.score.toFixed(1),
        entry.bounty.title,
        entry.score.valueUsd === null ? `— (${entry.score.valueBasis})` : `${formatAmount(entry.score.valueUsd)} ${entry.bounty.asset.symbol}`,
        entry.score.submissionCount === null ? 'unknown' : String(entry.score.submissionCount),
        entry.score.daysToDeadline === null ? 'unknown' : `${entry.score.daysToDeadline.toFixed(1)}d`,
        entry.bounty.verification?.status ?? 'unchecked',
        entry.score.flags.join(', ') || '—',
      ]),
    ),
  );
  return 0;
}

function tryResolve(ref: string, config: Config): SnapshotRef | null {
  try {
    return resolveSnapshotRef(ref, config);
  } catch {
    return null;
  }
}

async function cmdDiff(runtime: Runtime): Promise<number> {
  const { config, json, out, positionals } = runtime;
  const [oldArg, newArg] = positionals.slice(1);
  const newRef = tryResolve(newArg ?? 'latest', config);
  const oldRef = tryResolve(oldArg ?? 'previous', config);
  if (!oldRef || !newRef) {
    throw new Error('Need two snapshots: run "discover" at least twice (or use the committed fixture) before diffing.');
  }
  const diff = diffSnapshots(oldRef.snapshot, newRef.snapshot, { oldPath: oldRef.path, newPath: newRef.path });
  if (json) printJson(diff);
  else out(renderDiffMarkdown(diff));

  const outPath = typeof runtime.flags.out === 'string' ? runtime.flags.out : null;
  if (outPath) {
    const fs = await import('node:fs');
    fs.writeFileSync(outPath, json ? `${JSON.stringify(diff, null, 2)}\n` : renderDiffMarkdown(diff), 'utf8');
    out(`saved      ${outPath}`);
  }
  return 0;
}

async function cmdReport(runtime: Runtime): Promise<number> {
  const { config, json, out } = runtime;
  const explicit = config.snapshotPath ?? config.fixturePath;
  const baseline = explicit ? tryResolve(explicit, config) : tryResolve('previous', config);

  const result = await runPipeline(config, { diffAgainst: baseline, rpcClient: runtime.rpcClient });
  const generatedAt = config.now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const reportInput = {
    command: 'report',
    generatedAt,
    snapshot: result.snapshot,
    ranked: result.ranked,
    verification: result.verification,
    warnings: result.warnings,
    rpcEndpoint: result.rpcEndpoint,
    diff: result.diff,
    topN: config.topN,
  };
  const reportsDir = typeof runtime.flags['out-dir'] === 'string' ? (runtime.flags['out-dir'] as string) : config.reportsDir;
  const written = writeReports(reportInput, reportsDir);
  const snapshotPath = writeSnapshotFile(result.snapshot, config.snapshotsDir);

  if (json) {
    printJson({ ...buildReportJson(reportInput), files: written.files, snapshotFile: snapshotPath });
    return 0;
  }

  out(`${TOOL_NAME} v${TOOL_VERSION} — report`);
  out(`snapshot   ${result.snapshot.snapshotId}  source=${result.snapshot.source.kind}  rows=${result.snapshot.bounties.length}`);
  if (result.verification) {
    out(
      `escrow     ${result.verification.verified} verified / ${result.verification.mismatch} mismatch / ${result.verification.unknown} unknown`,
    );
  }
  if (result.diff) {
    out(`diff       ${result.diff.summary[0]}`);
  }
  out('');
  out(
    renderTable(
      ['#', 'Score', 'Bounty', 'Value used', 'Subs', 'Escrow', 'Coverage'],
      result.ranked.map((entry) => [
        String(entry.rank),
        entry.score.score.toFixed(1),
        entry.bounty.title,
        entry.score.valueUsd === null ? `— (${entry.score.valueBasis})` : `${formatAmount(entry.score.valueUsd)} ${entry.bounty.asset.symbol}`,
        entry.score.submissionCount === null ? 'unknown' : String(entry.score.submissionCount),
        entry.bounty.verification?.status ?? 'unchecked',
        formatPercent(entry.bounty.verification?.coverage ?? null, 0),
      ]),
    ),
  );
  out('');
  out(`markdown   ${rel(config, written.files.markdown)}`);
  out(`csv        ${rel(config, written.files.csv)}`);
  out(`json       ${rel(config, written.files.json)}`);
  out(`snapshot   ${rel(config, written.files.snapshot)}`);
  if (written.files.diff) out(`diff       ${rel(config, written.files.diff)}`);
  out(`saved      ${rel(config, snapshotPath)}`);
  if (result.warnings.length > 0) for (const warning of result.warnings) out(`warning    ${warning}`);
  return 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const command = argv[0] ?? 'help';
  const { config, flags, positionals } = loadConfig(argv);

  if (['help', '--help', '-h'].includes(command)) {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === 'version') {
    process.stdout.write(`${TOOL_NAME} ${TOOL_VERSION}\n`);
    return 0;
  }

  const json = flagBool(flags, 'json', false);
  const runtime: Runtime = {
    config,
    flags,
    positionals: argv,
    rpcClient: buildRpcClient(config),
    out: (line: string) => process.stdout.write(`${line}\n`),
    json,
  };

  switch (command) {
    case 'discover':
      return cmdDiscover(runtime);
    case 'verify':
      return cmdVerify(runtime);
    case 'rank':
      return cmdRank(runtime);
    case 'diff':
      return cmdDiff(runtime);
    case 'report':
      return cmdReport(runtime);
    case 'mcp':
      if (flagBool(flags, 'help', false)) {
        process.stdout.write(mcpUsage());
        return 0;
      }
      await runStdioServer({ config });
      return 0;
    case 'tools':
      printJson(serverCard(config));
      return 0;
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
      return 2;
  }
}

const thisFile = fileURLToPath(import.meta.url);
const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(thisFile);

if (invokedDirectly || process.env.ESCROW_SENTINEL_RUN === '1') {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${TOOL_NAME} error: ${errorMessage(error)}\n`);
      process.exitCode = 1;
    });
}

export type { Config, SnapshotRef, RpcClient };
export { createRpcClient };
