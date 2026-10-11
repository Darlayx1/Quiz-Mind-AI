import { execSync } from 'node:child_process';

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

Options to deploy to Supabase (Project: ${projectRef}):

OPTION A - Direct Automated Deployment (CLI):
1. Obtain an access token at: https://supabase.com/dashboard/account/tokens
2. Run in PowerShell:
   $env:SUPABASE_ACCESS_TOKEN="<your-access-token>"
   npm run deploy:edge

OPTION B - Manual Paste via Supabase Dashboard:
1. Open Edge Functions in dashboard:
   https://supabase.com/dashboard/project/${projectRef}/functions/quiz-ai
2. Copy the bundled file contents from:
   build/quiz-ai.ts
3. Paste and click Deploy.

Note: Database migration for single-call-high-v1 is located at:
supabase/migrations/202610110003_single_call_high_policy.sql
`);
  process.exit(0);
}

// 3. Deploy via Supabase CLI
console.log(`\n2. Deploying Edge Function 'quiz-ai' to project ${projectRef}...`);
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
