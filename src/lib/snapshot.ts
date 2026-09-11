import fs from 'node:fs';
import path from 'node:path';
import type { Snapshot } from '../types.js';
import { listFixtureFiles, readSnapshotFile } from './discover.js';

export interface SnapshotRef {
  path: string;
  snapshot: Snapshot;
}

/** Snapshot files, newest first (name order == capture order because of the UTC stamp). */
export function listSnapshotFiles(snapshotsDir: string): string[] {
  if (!fs.existsSync(snapshotsDir)) return [];
  return fs
    .readdirSync(snapshotsDir)
    .filter((name) => /^bounties-.*\.json$/.test(name))
    .sort()
    .reverse()
    .map((name) => path.join(snapshotsDir, name));
}

/**
 * Resolve a snapshot reference:
 *   `<path>.json` -> that file
 *   `latest`      -> newest capture in snapshots/, else the newest committed fixture
 *   `previous`    -> the one before `latest` (fixture included, so the first live run
 *                    can still be diffed against the committed baseline)
 */
export function resolveSnapshotRef(
  ref: string | null | undefined,
  directories: { snapshotsDir: string; fixturesDir: string },
): SnapshotRef {
  if (ref && /\.json$/i.test(ref)) {
    const resolved = path.resolve(ref);
    if (!fs.existsSync(resolved)) throw new Error(`Snapshot file not found: ${resolved}`);
    return { path: resolved, snapshot: readSnapshotFile(resolved) };
  }

  const ordered = [...listSnapshotFiles(directories.snapshotsDir), ...listFixtureFiles(directories.fixturesDir)];
  if (ordered.length === 0) {
    throw new Error(`No snapshots found in ${directories.snapshotsDir} or ${directories.fixturesDir}.`);
  }
  if (!ref || ref === 'latest') {
    const first = ordered[0] as string;
    return { path: first, snapshot: readSnapshotFile(first) };
  }
  if (ref === 'previous') {
    const second = ordered[1];
    if (!second) throw new Error('Only one snapshot is available, nothing to diff against yet.');
    return { path: second, snapshot: readSnapshotFile(second) };
  }
  throw new Error(`Unsupported snapshot reference "${ref}" (use a .json path, "latest" or "previous").`);
}

/** Pick the snapshot a command should read: explicit path, newest capture, then fixture. */
export function loadInputSnapshot(options: {
  snapshotPath: string | null;
  fixturePath: string | null;
  snapshotsDir: string;
  fixturesDir: string;
}): SnapshotRef {
  if (options.snapshotPath) return resolveSnapshotRef(options.snapshotPath, options);
  if (options.fixturePath) return resolveSnapshotRef(options.fixturePath, options);
  return resolveSnapshotRef('latest', options);
}
