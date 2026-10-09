import assert from 'node:assert/strict';
import { KeyPool, defaultSettings, validateCollection } from '../src/keyPool.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { encryptCollection, decryptCollection, MULTI_VAULT_KEY } from '../src/multiKeyVault.js';
import { generateQuiz } from '../src/server/aiService.js';
import { researchDiagnostics } from '../src/server/groqResearch.js';
import { generateQuizWithGroq } from '../src/server/groqService.js';
import { probeKey, groqRequest } from '../src/server/providerClient.js';
import type { QuizConfig } from '../src/types/quiz.js';
import express from 'express';
import { ServerKeyStore } from '../src/server/keyStore.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';

const keys = [
  { id: 'google', name: 'Gemini', provider: 'gemini' as const, key: 'fake-google-secret', project: 'same-id', priority: 1, enabled: true },
  { id: 'groq', name: 'Groq', provider: 'groq' as const, key: 'fake-groq-secret', project: 'same-id', priority: 1, enabled: true },
  { id: 'groq-backup', name: 'Groq backup', provider: 'groq' as const, key: 'fake-groq-backup', project: 'other-org', priority: 2, enabled: true },
];
const config: QuizConfig = { provider: 'groq', model: 'openai/gpt-oss-20b', topic: 'Aljabar', difficulty: 'easy', questionCount: 7, timeLimitMinutes: 5, language: 'id', enableGrounding: true };
const originalFetch = globalThis.fetch;
const calls: { provider: string; key: string; model?: string; body?: any }[] = [];
let failGroq = 0, failGoogle = 0, malformed = false, invalidQuestion = false, truncate = false, searchEmpty = false, serial = 0, slow = false;
const makeQuiz = (count: number) => ({ title: 'Aljabar', topic: 'Aljabar', summary: 'Konsep aljabar.', questions: Array.from({length: count},() => ({ question: `Pertanyaan ${++serial}: berapa dua tambah dua?`, options: invalidQuestion ? ['4','4','4','4'] : ['4','3','5','6','7'], correctAnswerIndex: invalidQuestion ? 8 : 0, explanation: 'Dua tambah dua adalah empat.', topicCategory: 'Penjumlahan', referenceTitle: '' })) });
globalThis.fetch = async (input, init) => {
  const request = new Request(input,init);
  if (!request.url.startsWith('https://api.groq.com/') && !request.url.startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(input,init);
  const provider = request.url.includes('api.groq.com') ? 'groq' : 'gemini';
  const body = request.method === 'POST' ? await request.json() : undefined;
  const key = provider === 'groq' ? request.headers.get('authorization')!.slice(7) : request.headers.get('x-goog-api-key') ?? '';
  const model = body?.model ?? decodeURIComponent(request.url.match(/models\/([^:]+):/)?.[1] ?? '');
  calls.push({provider,key,model,body});
  if (slow) { request.signal.throwIfAborted(); await new Promise((_resolve,reject) => {
    // Keep this mock request alive like a real network operation and fail rather than hang.
    const watchdog=setTimeout(()=>reject(request.signal.aborted?request.signal.reason:new Error('Mock cancellation timed out')),1000);
    request.signal.addEventListener('abort',()=>{clearTimeout(watchdog);reject(request.signal.reason);},{once:true});
  }); }
  const failure = provider === 'groq' ? failGroq : failGoogle;
  if (failure) return Response.json({error:{ code: failure, message: 'Test provider error', status: failure === 401 ? 'UNAUTHENTICATED' : 'RESOURCE_EXHAUSTED' }},{status:failure,headers:{'retry-after':'120'}});
  if (request.method === 'GET') return provider === 'groq' ? Response.json({data:[{id:'openai/gpt-oss-20b'},{id:'custom/text-model'}]}) : Response.json({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}]});
  if (provider === 'groq' && body.tools?.[0]?.type === 'browser_search') return Response.json({ choices:[{message:{content:searchEmpty ? '' : 'Hasil pencarian web: aljabar adalah cabang matematika. Sumber terbaru tersedia untuk topik ini.'},finish_reason:'stop'}] });
  const prompt = provider === 'groq' ? body.messages.at(-1).content : JSON.stringify(body.contents);
  const count = Number(/Jumlah Soal: (\d+)/.exec(prompt)?.[1] ?? 1);
  const content = malformed ? 'not json' : JSON.stringify(makeQuiz(count));
  return provider === 'groq' ? Response.json({ choices:[{message:{content},finish_reason:truncate?'length':'stop'}] }) : Response.json({candidates:[{content:{role:'model',parts:[{text:content}]}}]});
};
const reset = () => { calls.length=0; failGroq=failGoogle=0; malformed=invalidQuestion=truncate=searchEmpty=slow=false; };
try {
  assert.equal(normalizeQuizConfig({...config,model:'custom/text-model'}).provider,'groq');
  assert.equal(normalizeQuizConfig({topic:'Aljabar',provider:'groq'}).model,'qwen/qwen3.8-27b');
  assert.equal(normalizeQuizConfig({topic:'Aljabar',provider:'groq',model:'qwen/qwen3.8-27'}).model,'qwen/qwen3.8-27b');
  assert.throws(() => normalizeQuizConfig({...config,model:'gemini-3.8-flash'}),/tidak sesuai/);
  assert.throws(() => normalizeQuizConfig({...config,model:'https://untrusted.invalid'}),/tidak didukung/);
  const legacy = validateCollection({keys:[{...keys[0],provider:undefined}],settings:{mode:'priority',allowModelFallback:false,allowGroundingFallback:false}});
  assert.equal(legacy.schemaVersion,3); assert.equal(legacy.keys[0].provider,'gemini');
  assert.equal(legacy.settings.allowProviderFallback,false);
  const collection = validateCollection({keys,settings:{...defaultSettings}});
  const backup = await encryptCollection(collection,'fake-backup-password');
  assert.equal(JSON.parse(backup).version,3); assert.deepEqual(await decryptCollection(backup,'fake-backup-password'),collection);
  // A genuine v2 payload with the old AAD must migrate; changing an envelope label alone is insufficient.
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey('raw',new TextEncoder().encode('fake-legacy-password'),'PBKDF2',false,['deriveKey']);
  const cipherKey = await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const bytes = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(MULTI_VAULT_KEY)},cipherKey,new TextEncoder().encode(JSON.stringify({keys:[{...keys[0],provider:undefined}],settings:{mode:'priority',allowModelFallback:false,allowGroundingFallback:false}})));
  const v2 = JSON.stringify({version:2,iterations:600000,salt:Buffer.from(salt).toString('base64'),iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(bytes).toString('base64')});
  assert.equal((await decryptCollection(v2,'fake-legacy-password')).keys[0].provider,'gemini');
  let pool = new KeyPool(collection);
  const quiz = await generateQuiz(config,undefined,{pool});
  assert.equal(quiz.questions.length,7); assert.equal(quiz.provider,'groq'); assert.equal(quiz.requestedProvider,'groq'); assert.equal(quiz.usedGrounding,true);
  assert.equal(calls.length,3); assert.ok(calls.every(call => call.provider === 'groq' && call.key === 'fake-groq-secret'));
  assert.equal(calls[0].body.tools[0].type,'browser_search'); assert.equal(calls[0].body.tool_choice,'required');
  assert.ok(calls.every(call => call.body?.reasoning_effort === 'high'));
  assert.equal(calls[1].body.response_format.json_schema.strict,true);
  assert.equal(calls[0].body.response_format,undefined);
  assert.ok(calls[1].body.messages.at(-1).content.includes('Hasil pencarian web'));
  reset();
  assert.equal((await generateQuiz({...config,model:'qwen/qwen3.8-27b',questionCount:1},undefined,{pool})).usedGrounding,true);
  assert.equal(calls[1].body.model,'qwen/qwen3.8-27b');
  assert.equal(calls[1].body.reasoning_format,'hidden');
  reset(); searchEmpty=true;
  await assert.rejects(generateQuiz({...config,questionCount:1},undefined,{pool}),/Pencarian web Groq tidak menghasilkan/);
  assert.equal(calls.length,1);
  reset();
  await assert.rejects(generateQuiz({...config,questionCount:1,model:'custom/text-model'},undefined,{pool}),/thinking tertinggi/);
  assert.equal(calls.length,0);
  reset();
  assert.equal((await generateQuiz({...config,enableGrounding:true,questionCount:1},undefined,{pool})).usedGrounding,true);
  assert.equal(calls[0].body.tools[0].type,'browser_search');
  assert.deepEqual(await probeKey(keys[1]),['openai/gpt-oss-20b','custom/text-model']);
  reset(); failGroq=429;
  pool=new KeyPool(collection);
  await assert.rejects(generateQuiz({...config,questionCount:1},undefined,{pool}));
  assert.equal(pool.status('groq').state,'waiting'); assert.equal(pool.status('google').state,'untested'); assert.ok(calls.every(call=>call.provider==='groq'));
  assert.ok(pool.status('groq').until! >= Date.now()+115000);
  reset(); failGroq=401;
  pool=new KeyPool({...collection,settings:{...defaultSettings,allowKeyFallback:false}});
  await assert.rejects(generateQuiz({...config,questionCount:1},undefined,{pool})); assert.equal(calls.length,1);
  reset(); failGroq=404;
  pool=new KeyPool({...collection,settings:{...defaultSettings,allowModelFallback:true}});
  // Only the requested model is missing; model fallback uses the same provider and key.
  const mockFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{const req=new Request(input,init);if(req.method==='POST' && req.url.includes('api.groq.com')) {const body=await req.clone().json();failGroq=!body.tools && body.model==='openai/gpt-oss-20b'?404:0;}return mockFetch(input,init);};
  assert.equal((await generateQuiz({...config,questionCount:1},undefined,{pool})).model,'openai/gpt-oss-120b'); assert.deepEqual(calls.map(call=>call.model),['openai/gpt-oss-20b','openai/gpt-oss-20b','openai/gpt-oss-120b']);
  globalThis.fetch=mockFetch;
  reset(); failGoogle=429;
  pool=new KeyPool({...collection,settings:{...defaultSettings,allowProviderFallback:true}});
  const notices:string[]=[];
  const fallback=await generateQuiz({...config,enableGrounding:false,provider:'gemini',model:'gemini-3.8-flash',questionCount:1},undefined,{pool,onNotice:message=>notices.push(message)});
  assert.equal(fallback.provider,'groq'); assert.equal(fallback.requestedProvider,'gemini'); assert.equal(fallback.requestedModel,'gemini-3.8-flash'); assert.ok(notices.some(message=>message.includes('Materi dikirim')));
  reset(); failGoogle=429;
  pool=new KeyPool({...collection,settings:{...defaultSettings,allowProviderFallback:true}});
  await assert.rejects(generateQuiz({...config,provider:'gemini',model:'gemini-3.8-flash',questionCount:1,enableGrounding:true},undefined,{pool})); assert.ok(calls.every(c=>c.provider==='gemini'));
  reset(); failGoogle=429;
  pool=new KeyPool({...collection,settings:{...defaultSettings,allowProviderFallback:true,allowGroundingFallback:true}});
  await assert.rejects(generateQuiz({...config,provider:'gemini',model:'gemini-3.8-flash',questionCount:1,enableGrounding:true},undefined,{pool})); assert.ok(calls.every(c=>c.provider==='gemini'));
  reset(); malformed=true;
  await assert.rejects(generateQuiz({...config,questionCount:1},undefined,{pool:new KeyPool(collection)}),/JSON/); assert.equal(calls.length,2);
  reset(); invalidQuestion=true;
  await assert.rejects(generateQuiz({...config,questionCount:1},undefined,{pool:new KeyPool(collection)}),/soal valid/);
  reset(); truncate=true;
  await assert.rejects(generateQuiz({...config,questionCount:1},undefined,{pool:new KeyPool(collection)}),/terpotong/);
  reset(); slow=true;
  const controller=new AbortController();
  const pending=generateQuiz({...config,questionCount:1},undefined,{pool:new KeyPool(collection),signal:controller.signal});
  setTimeout(()=>controller.abort(),50); await assert.rejects(pending,error=>(error as Error).name==='AbortError');
  reset();

  slow=true;
  await assert.rejects(groqRequest('chat/completions','fake-timeout-key',AbortSignal.timeout(20),{model:'openai/gpt-oss-20b'}),(e:any)=>e.name==='TimeoutError');reset();
  // Deterministic research regressions; no credentials or external requests.
  const normalFetch=globalThis.fetch;
  let researchAttempts=0, responses:any[]=[];
  globalThis.fetch=async(input,init)=>{
    const req=new Request(input,init);
    if(req.method==='POST' && req.url.includes('api.groq.com')){
      const b=await req.clone().json();
      if(b.tools){researchAttempts++;const next=responses.shift();
        if(next instanceof Response)return next;
        if(next==='timeout')return Response.json({}, {status:504});
        if(next)return Response.json(next);
      }
    }
    return normalFetch(input,init);
  };
  const researchResponse=(content:any,finish='stop')=>({choices:[{message:{content,reasoning:'private reasoning',executed_tools:[{output:'private tool output'}]},finish_reason:finish}]});
  const fresh=()=>new KeyPool(collection);
  for(const [content,finish,code] of [[null,'stop','WEB_SEARCH_EMPTY'],['','stop','WEB_SEARCH_EMPTY'],['partial','length','WEB_SEARCH_TRUNCATED']] as const){
    reset();researchAttempts=0;responses=[researchResponse(content,finish)];const research:{}={};
    await assert.rejects(generateQuizWithGroq({...config,questionCount:1},undefined,{pool:fresh(),research}), (e:any)=>e.code===code);
    assert.equal(researchAttempts,1);assert.deepEqual(research,{});assert.equal(calls.length,0,'No quiz call after failed research');

  }
  reset();researchAttempts=0;responses=[Response.json({}, {status:503}),researchResponse('Materi riset valid tentang aljabar.')];
  const budget={calls:0};assert.equal((await generateQuizWithGroq({...config,questionCount:1},undefined,{pool:fresh(),attemptBudget:budget})).usedGrounding,true);assert.equal(researchAttempts,2);assert.equal(budget.calls,3);
  reset();researchAttempts=0;responses=[Response.json({}, {status:503}),researchResponse('Materi riset valid tentang aljabar.')];failGroq=503;
  const exhaustedBudget={calls:0};await assert.rejects(generateQuizWithGroq({...config,questionCount:1},undefined,{pool:fresh(),attemptBudget:exhaustedBudget}));assert.equal(researchAttempts,2);assert.equal(calls.length,1);assert.equal(exhaustedBudget.calls,3,'No nested retries beyond shared budget');
  reset();researchAttempts=0;responses=[Response.json({}, {status:503}),Response.json({}, {status:503})];
  await assert.rejects(generateQuiz({...config,questionCount:1},undefined,{pool:fresh()}),(e:any)=>e.code==='WEB_SEARCH_UNAVAILABLE');assert.equal(researchAttempts,2);assert.equal(calls.length,0);
  for(const [status,code] of [[429,'WEB_SEARCH_RATE_LIMITED'],[401,'PROVIDER_ERROR'],[400,'PROVIDER_ERROR']] as const){
    reset();researchAttempts=0;responses=[Response.json({error:{message:'gsk_sensitive prompt'}},{status,headers:{'retry-after':'120'}})];
    await assert.rejects(generateQuiz({...config,questionCount:1},undefined,{pool:fresh()}),(e:any)=>e.code===code&&!e.message.includes('gsk_sensitive'));assert.equal(researchAttempts,1);
  }
  reset();researchAttempts=0;responses=['timeout','timeout'];
  await assert.rejects(generateQuiz({...config,questionCount:1},undefined,{pool:fresh()}),(e:any)=>e.code==='WEB_SEARCH_TIMEOUT');assert.equal(researchAttempts,2);
  reset();researchAttempts=0;responses=[];
  assert.equal((await generateQuiz({...config,enableGrounding:false,questionCount:1},undefined,{pool:fresh()})).usedGrounding,false);assert.equal(researchAttempts,0);assert.equal(calls.length,1);
  reset();researchAttempts=0;responses=[researchResponse('Riset request pertama.')];
  await generateQuiz(config,undefined,{pool:fresh()});assert.equal(researchAttempts,1,'Research shared across batches');
  responses=[researchResponse('Riset request kedua.')];await generateQuiz({...config,questionCount:1},undefined,{pool:fresh()});assert.equal(researchAttempts,2);assert.ok(calls.at(-1)!.body.messages.at(-1).content.includes('Riset request kedua.'));assert.ok(!calls.at(-1)!.body.messages.at(-1).content.includes('Riset request pertama.'));
  const diagnostics=JSON.stringify(researchDiagnostics({...researchResponse('secret prompt'),usage:{prompt_tokens:3,completion_tokens:8,other:'secret key'}},5,{status:401,message:'secret key',headers:new Headers({authorization:'secret key'})}));assert.ok(!diagnostics.includes('secret'));assert.ok(!diagnostics.includes('private'));
  globalThis.fetch=normalFetch;reset();

  // Gemini grounding must be proven on every batch; never continue without web.
  const googleFetch=globalThis.fetch;
  let googleMode='grounded';
  globalThis.fetch=async(input,init)=>{
    const req=new Request(input,init);
    const response=await googleFetch(input,init);
    if(req.url.includes('generativelanguage.googleapis.com') && req.method==='POST' && response.ok){
      const data=await response.json();
      if(googleMode==='grounded')data.candidates[0].groundingMetadata={webSearchQueries:['aljabar'],groundingChunks:[{web:{uri:'https://example.org/algebra',title:'Aljabar'}}]};
      if(googleMode==='truncated')data.candidates[0].finishReason='MAX_TOKENS';
      return Response.json(data);
    }
    return response;
  };
  reset();
  const googleConfig={...config,provider:'gemini' as const,model:'gemini-3.8-flash',enableGrounding:true};
  assert.equal((await generateQuiz(googleConfig,undefined,{pool:fresh()})).usedGrounding,true);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.body.tools?.length));
  for(const [mode,code] of [['missing','WEB_SEARCH_EMPTY'],['truncated','WEB_SEARCH_TRUNCATED']]){
    reset();googleMode=mode;await assert.rejects(generateQuiz({...googleConfig,questionCount:1},undefined,{pool:new KeyPool({...collection,settings:{...defaultSettings,allowGroundingFallback:true,allowProviderFallback:true}})}),(e:any)=>e.code===code);assert.equal(calls.length,1);
  }
  globalThis.fetch=googleFetch;reset();

  const dir=mkdtempSync(path.join(tmpdir(),'quizmind-provider-test-'));
  const loginPassword='fake-test-owner-password', loginSalt=randomBytes(16);
  const store=new ServerKeyStore({VAULT_USERNAME:'tester',VAULT_PASSWORD_HASH:`scrypt$${loginSalt.toString('hex')}$${scryptSync(loginPassword,loginSalt,64).toString('hex')}`,ENCRYPTION_SECRET:'fake-only-test-encryption-secret-32-characters',DATA_DIR:dir,NODE_ENV:'test'});
  const app=express();app.use(express.json());store.install(app);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/keys/`;
  let cookie='',csrf='';
  const call=(route:string,body:unknown)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json',cookie,'x-vault-csrf':csrf},body:JSON.stringify(body)});
  try {
    let res=await call('login',{username:'tester',password:loginPassword});cookie=res.headers.get('set-cookie')!.split(';')[0];csrf=(await res.json()).csrf;
    res=await call('add',{keys:[keys[1]],revision:0});assert.equal(res.status,200);assert.equal((await res.json()).keys[0].provider,'groq');
    res=await call('test',{id:'groq'});assert.equal(res.status,200);const tested=await res.json();assert.ok(tested.models.includes('custom/text-model'));assert.equal(JSON.stringify(tested).includes(keys[1].key),false);
    res=await call('test-generation',{id:'groq',model:'openai/gpt-oss-20b'});assert.equal(res.status,200);assert.equal((await res.json()).testedModel,'openai/gpt-oss-20b');
    res=await call('update',{id:'groq',revision:1,patch:{provider:'gemini'}});assert.equal(res.status,400);
    res=await call('export',{password:'fake-backup-password'});const exported=await res.json();assert.equal((await decryptCollection(exported.backup,'fake-backup-password')).keys[0].provider,'groq');
  } finally { store.close();await new Promise<void>(resolve=>server.close(()=>resolve()));assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));assert.ok(path.basename(dir).startsWith('quizmind-provider-test-'));rmSync(dir,{recursive:true,force:true}); }
  console.log('PASS providers: Groq batches/schema/custom models, provider isolation, scoped quota and retry headers, key/model/provider fallback, grounding compatibility, invalid output, cancellation, genuine v2 migration, encrypted mixed-provider backup, server probes and generation test. No external API calls.');
} finally { globalThis.fetch=originalFetch; }
