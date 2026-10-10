import { spawnSync } from 'node:child_process';
const checks = [
  ['scripts/build-edge.mjs'],
  ['--import', 'tsx', 'scripts/parallel-search-test.ts'],
  ['scripts/parallel-db-test.mjs'],
  ['--import', 'tsx', 'scripts/parallel-account-test.ts'],
  ['--import', 'tsx', 'scripts/workspace-test.ts'],
  ['--import', 'tsx', 'scripts/workspace-generation-test.ts'],
];
for (const args of checks) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', timeout: 60000 });
  if (result.error || result.status !== 0) { if (result.error) console.error(result.error.message); process.exit(result.status || 1); }
}
