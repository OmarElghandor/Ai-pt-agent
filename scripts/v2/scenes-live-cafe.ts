/**
 * Live (not CI) cena-cafe script on Qwen — thin wrapper.
 * Prefer: npx tsx scripts/v2/scenes-live.ts cafe
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const runner = path.join(__dirname, 'scenes-live.ts');
const r = spawnSync('npx', ['tsx', runner, 'cafe'], {
  stdio: 'inherit',
  env: process.env,
  cwd: path.join(__dirname, '../..'),
});
process.exit(r.status ?? 1);
