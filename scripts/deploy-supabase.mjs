import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

console.log('=== Quiz Mind AI Supabase Deployment Automation ===\n');

// 1. Re-bundle Edge Function code
console.log('1. Building Supabase Edge functions...');
execSync('node scripts/build-edge.mjs', { stdio: 'inherit' });

// 2. Check for token from env or CLI arguments
const cliToken = process.argv.slice(2).find(arg => arg.startsWith('sbp_') || arg.length > 30);
const token = cliToken || process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_AUTH_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'btsvqhlfkkgwkqsezzoq';

if (!token) {
  console.log(`
[!] SUPABASE_ACCESS_TOKEN not detected in environment variables or arguments.

Options to deploy to Supabase (Project: ${projectRef}):

OPTION A - Direct Automated Deployment (CLI):
1. Obtain an access token at: https://supabase.com/dashboard/account/tokens
2. Run in PowerShell:
   $env:SUPABASE_ACCESS_TOKEN="<your-access-token>"
   npm run deploy:edge
   
   OR:
   npm run deploy:edge -- <your-access-token>

OPTION B - Manual Paste via Supabase Dashboard:
1. Open Edge Functions in dashboard:
   https://supabase.com/dashboard/project/${projectRef}/functions/quiz-ai
2. Copy the bundled file contents from:
   build/quiz-ai.ts
3. Paste and click Deploy.
4. Execute SQL migration in SQL Editor:
   https://supabase.com/dashboard/project/${projectRef}/sql/new
   using contents from: supabase/migrations/202610110003_single_call_high_policy.sql
`);
  process.exit(0);
}

// 3. Deploy Edge Function 'quiz-ai'
console.log(`\n2. Deploying Edge Function 'quiz-ai' to project ${projectRef}...`);
try {
  execSync(`npx --yes supabase functions deploy quiz-ai --project-ref ${projectRef} --no-verify-jwt`, {
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }
  });
  console.log('✅ Edge function quiz-ai deployed successfully!');
} catch (error) {
  console.error('❌ quiz-ai deployment failed:', error.message);
}

// 4. Deploy Edge Function 'parallel-search'
console.log(`\n3. Deploying Edge Function 'parallel-search' to project ${projectRef}...`);
try {
  execSync(`npx --yes supabase functions deploy parallel-search --project-ref ${projectRef} --no-verify-jwt`, {
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }
  });
  console.log('✅ Edge function parallel-search deployed successfully!');
} catch (error) {
  console.warn('⚠️ parallel-search deployment:', error.message);
}

// 5. Apply Database Migration
console.log(`\n4. Applying database migration to project ${projectRef}...`);
try {
  const migrationSql = readFileSync('supabase/migrations/202610110003_single_call_high_policy.sql', 'utf8');
  const queryRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: migrationSql })
  });
  if (queryRes.ok) {
    console.log('✅ Database migration applied successfully!');
  } else {
    const errText = await queryRes.text();
    console.warn('⚠️ Database migration API note:', errText);
  }
} catch (error) {
  console.warn('⚠️ Database migration note:', error.message);
}

console.log('\n=== Supabase Deployment Finished ===\n');
