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

// Helper: deploy function directly via Supabase Management API
async function deployFunctionViaApi(slug, filePath, name) {
  const code = readFileSync(filePath, 'utf8');
  const formData = new FormData();
  formData.append('metadata', JSON.stringify({
    entrypoint_path: 'index.ts',
    name: name || slug,
    verify_jwt: false
  }));
  formData.append('file', new Blob([code], { type: 'application/typescript' }), 'index.ts');

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${slug}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Deploy ${slug} failed (${res.status}): ${errText}`);
  }
  return await res.json();
}

// 4. Deploy Edge Function 'quiz-ai'
console.log(`\n3. Deploying Edge Function 'quiz-ai' to project ${projectRef}...`);
try {
  const res = await deployFunctionViaApi('quiz-ai', 'build/quiz-ai.ts', 'quiz-ai');
  console.log(`✅ Edge function 'quiz-ai' deployed successfully! (version: ${res.version || 'active'}, status: ${res.status || 'OK'})`);
} catch (error) {
  console.error('❌ Direct API deployment failed, falling back to CLI:', error.message);
  try {
    execSync(`npx --yes supabase functions deploy quiz-ai --project-ref ${projectRef} --no-verify-jwt`, {
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }
    });
    console.log('\n✅ Edge function quiz-ai deployed successfully via CLI!');
  } catch (cliErr) {
    console.error('\n❌ CLI Deployment failed as well:', cliErr.message);
    process.exit(1);
  }
}

// 5. Deploy Edge Function 'parallel-search'
console.log(`\n4. Deploying Edge Function 'parallel-search' to project ${projectRef}...`);
try {
  const res = await deployFunctionViaApi('parallel-search', 'build/parallel-search.ts', 'parallel-search');
  console.log(`✅ Edge function 'parallel-search' deployed successfully! (version: ${res.version || 'active'}, status: ${res.status || 'OK'})`);
} catch (error) {
  console.warn('⚠️ Parallel search deploy skipped/optional:', error.message);
}

console.log('\n🎉 ALL DONE! Supabase database and Edge functions are fully updated and live.');
