import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Bundle Vite's client API with an explicit test environment. All HTTP is mocked.
const root = path.resolve('.qa');
mkdirSync(root, { recursive: true });
const dir = mkdtempSync(path.join(root, 'generation-ui-'));
const originalFetch = globalThis.fetch;
try {
  const file = path.join(dir, 'client.mjs');
  await build({ entryPoints: ['src/api.ts'], outfile: file, bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/test/' }) }, logLevel: 'silent' });
  const api = await import(pathToFileURL(file).href);
  api.activateCollection({keys:[{id:'test',provider:'groq',name:'Test',key:'gsk_fake_ui_test_secret',project:'',priority:1,enabled:true}],settings:{mode:'priority',allowModelFallback:false,allowGroundingFallback:false}},false);
  let calls=0;
  globalThis.fetch = async () => { calls++; return Response.json({choices:[{message:{content:null},finish_reason:'stop'}]}); };
  const config={provider:'groq',model:'openai/gpt-oss-20b',topic:'Aljabar',questionCount:1,enableGrounding:true};
  const send=()=>api.fetchApi('/api/generate-quiz',{method:'POST',body:JSON.stringify(config)});
  const first=send();
  const duplicate=await send();
  assert.equal(duplicate.status,409);
  const response=await first, data=await response.json();
  assert.equal(response.status,502);assert.equal(data.success,false);assert.equal(data.code,'WEB_SEARCH_EMPTY');assert.equal(data.quiz,undefined);
  assert.match(data.error,/materi riset/);assert.ok(!JSON.stringify(data).includes('gsk_fake'));assert.equal(calls,1);
  const second=await send();assert.equal(second.status,502);assert.equal(calls,2,'Failed generation releases submission lock');
  assert.equal(api.safeError(new Error('gsk_fake_ui_test_secret')), '[key disamarkan]');
  const creator=readFileSync('src/components/QuizCreator.tsx','utf8'), app=readFileSync('src/App.tsx','utf8');
  assert.ok(creator.includes('role="alert"'));assert.ok(creator.includes('<p>{errorMessage}</p>'));assert.ok(creator.includes('disabled={isLoading}'));
  assert.ok(creator.includes('checked={enableGrounding && supportsGrounding}'));
  assert.ok(app.includes('if (requestController.current) return;'));assert.ok(app.includes('setIsLoading(false);'));assert.ok(app.indexOf('if (!response.ok || !data.success)')<app.indexOf('setCurrentQuiz(generatedQuiz)'));
  api.lockKeys();
  console.log('PASS client generation: accurate error contract, no partial success, key redaction, double submission lock/recovery, UI alert/loading source contracts. Browser interaction not exercised.');
} finally {
  globalThis.fetch=originalFetch;
  assert.ok(path.resolve(dir).startsWith(root+path.sep));
  rmSync(dir,{recursive:true,force:true});
}
