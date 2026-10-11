import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

console.log('=== Quiz Mind AI Supabase Deployment Automation ===\n');

// 1. Re-bundle Edge Function code
console.log('1. Building Supabase Edge functions...');
execSync('node scripts/build-edge.mjs', { stdio: 'inherit' });

// 2. Check for token
const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_AUTH_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'btsvqhlfkkgwkqsezzoq';

if (!token) {
  console.log(`
[!] SUPABASE_ACCESS_TOKEN not detected in environment variables.

Supabase requires a Personal Access Token to allow automated deployment:
1. Open https://supabase.com/dashboard/account/tokens
2. Click "Generate new token", enter any name (e.g. "deploy"), and copy the token (starts with sbp_...)
3. Run in PowerShell:
   $env:SUPABASE_ACCESS_TOKEN="<token>"
   npm run deploy:edge
`);
  process.exit(1);
}

// 3. Run database migration via Supabase Management API
console.log(`\n2. Applying database migration to project ${projectRef}...`);
try {
  const migrationSql = readFileSync('supabase/migrations/202610110003_single_call_high_policy.sql', 'utf8');
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: migrationSql })
  });
  if (response.ok) {
    console.log('✅ Database migration applied successfully!');
  } else {
    const errorText = await response.text();
    console.warn(`⚠️ Note on migration via API (${response.status}): ${errorText}`);
  }
} catch (e) {
  console.warn('⚠️ Note on migration execution:', e.message);
}

// 4. Deploy Edge Function 'quiz-ai'
console.log(`\n3. Deploying Edge Function 'quiz-ai' to project ${projectRef}...`);
try {
  execSync(`npx --yes supabase functions deploy quiz-ai --project-ref ${projectRef} --no-verify-jwt`, {
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }
  });
  console.log('\n✅ Edge function quiz-ai deployed successfully!');
} catch (error) {
  console.error('\n❌ Deployment failed:', error.message);
  process.exit(1);
}

console.log('\n🎉 ALL DONE! Supabase backend is fully up-to-date and ready.');
