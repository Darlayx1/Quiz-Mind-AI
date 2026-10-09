import assert from 'node:assert/strict';
import { KeyPool, defaultSettings, validateCollection, nextPacificMidnight, errorKind, type KeyCollection } from '../src/keyPool.js';
import { encryptCollection, decryptCollection, storeVault, openVault, MULTI_VAULT_KEY } from '../src/multiKeyVault.js';
import { savePersonalKey, VAULT_STORAGE_KEY } from '../src/personalKeyVault.js';
import { generateQuizWithGemini } from '../src/server/geminiService.js';
import { readGenerationStream } from '../src/generationStream.js';
import { DEFAULT_MODEL } from '../src/models.js';
const records = new Map<string,string>(); let failWrites = false;
Object.defineProperty(globalThis,'localStorage',{ configurable:true, value: {
  getItem: (k:string) => records.get(k) ?? null,
  setItem: (k:string,v:string) => { if (failWrites) throw new Error('disk full'); records.set(k,v); }, removeItem: (k:string) => records.delete(k)
} });
const collection: KeyCollection = validateCollection({ settings: { ...defaultSettings }, keys: [
  { id:'a', name:'Utama', project:'project-one', key:'fake-secret-one', enabled:true, priority:1 },
  { id:'b', name:'Kuota bersama', project:'project-one', key:'fake-secret-two', enabled:true, priority:2 },
  { id:'c', name:'Cadangan', project:'project-two', key:'fake-secret-three', enabled:true, priority:3 }
] });
const password = 'fake-test-vault-password';
const notices:string[]=[];
const streamBytes=new TextEncoder().encode(JSON.stringify({notice:'Beralih ke Cadangan ✓'})+'\n'+JSON.stringify({success:true,quiz:{title:'Latihan'}})+'\n');
const stream=new ReadableStream({start(controller){for(let i=0;i<streamBytes.length;i+=2)controller.enqueue(streamBytes.slice(i,i+2));controller.close();}});
assert.equal((await (await readGenerationStream(new Response(stream,{headers:{'content-type':'application/x-ndjson'}}),message=>notices.push(message))).json()).quiz.title,'Latihan');
assert.deepEqual(notices,['Beralih ke Cadangan ✓']);
assert.equal((await readGenerationStream(new Response('{"success":false,"status":429,"error":"quota"}\n',{headers:{'content-type':'application/x-ndjson'}}),()=>{})).status,429);
assert.equal((await readGenerationStream(new Response('{"notice":"retry"}\n',{headers:{'content-type':'application/x-ndjson'}}),()=>{})).status,502);
const backup = await encryptCollection(collection,password);
assert.equal(backup.includes('fake-secret'),false); assert.equal(backup.includes(password),false);
assert.deepEqual(await decryptCollection(backup,password),collection);
await assert.rejects(decryptCollection(backup,'incorrect-password'));
const tampered = JSON.parse(backup); const encrypted = Buffer.from(tampered.ciphertext,'base64'); encrypted[0] ^= 1; tampered.ciphertext = encrypted.toString('base64');
await assert.rejects(decryptCollection(JSON.stringify(tampered),password));
await assert.rejects(decryptCollection(JSON.stringify({ ...tampered, iterations: 10_000_000_000 }),password));
assert.throws(() => validateCollection({ ...collection, keys:[collection.keys[0],{...collection.keys[1],key:collection.keys[0].key}] }));
await savePersonalKey('legacy-fake-secret',password);
const legacy = records.get(VAULT_STORAGE_KEY);
assert.equal((await openVault(password)).keys[0].key,'legacy-fake-secret');
failWrites = true; await assert.rejects(storeVault(collection,password)); assert.equal(records.get(VAULT_STORAGE_KEY),legacy); failWrites = false;
await storeVault(collection,password); assert.deepEqual(await openVault(password),collection); assert.equal(records.has(VAULT_STORAGE_KEY),false);
const intact = records.get(MULTI_VAULT_KEY);
failWrites = true; await assert.rejects(storeVault({ ...collection,keys:[] },password)); failWrites = false; assert.equal(records.get(MULTI_VAULT_KEY),intact);
const saving = storeVault(collection,password); records.set(MULTI_VAULT_KEY,'changed externally'); await assert.rejects(saving,/tab lain/); records.set(MULTI_VAULT_KEY,intact!);
const newer = await encryptCollection(collection,password); assert.notEqual(JSON.parse(newer).iv,JSON.parse(backup).iv); assert.notEqual(JSON.parse(newer).salt,JSON.parse(backup).salt);

let pool = new KeyPool(collection); const used:string[] = [];
assert.equal(await pool.run(async key => { used.push(key); if (key === 'fake-secret-one') throw Object.assign(new Error('quota per minute'),{status:429,retryAfterMs:120000}); return 'ok'; }), 'ok');
assert.deepEqual(used,['fake-secret-one','fake-secret-three']); assert.equal(pool.status('b').state,'waiting');
pool.reset('a'); used.length=0;
assert.equal(await pool.run(async key => { used.push(key); if (key === 'fake-secret-one') throw Object.assign(new Error('API key not valid'),{status:400}); return true; }),true);
assert.deepEqual(used,['fake-secret-one','fake-secret-two']); assert.equal(pool.status('a').state,'invalid');
pool.update({ ...collection,settings: {...defaultSettings,mode:'balanced'} }); assert.equal(pool.status('a').state,'invalid');
pool = new KeyPool(collection); let calls = 0;
await assert.rejects(pool.run(async () => { calls++; throw Object.assign(new Error('invalid input'),{status:400}); })); assert.equal(calls,1);
calls=0; await assert.rejects(pool.run(async () => { calls++; throw new TypeError('Failed to fetch'); })); assert.equal(calls,1);
pool = new KeyPool(collection); calls=0;
await assert.rejects(pool.run(async () => { calls++; throw Object.assign(new Error('Unavailable'),{status:503}); })); assert.equal(calls,3);
assert.equal(errorKind({status:429,message:'{"retryDelay":"45s"}'}).retryMs,45000);
assert.equal(nextPacificMidnight(Date.parse('2026-10-08T12:00:00Z')),Date.parse('2026-10-09T07:00:00Z'));
assert.equal(nextPacificMidnight(Date.parse('2026-11-01T12:00:00Z')),Date.parse('2026-11-02T08:00:00Z'));

pool = new KeyPool({ ...collection,keys:collection.keys.slice(0,2) }); let active=0,peak=0;
await Promise.all([1,2].map(() => pool.run(async () => { active++; peak=Math.max(peak,active); await new Promise(r=>setTimeout(r,150)); active--; return true; })));
assert.equal(peak,1);
pool = new KeyPool({ ...collection,settings:{...defaultSettings,mode:'balanced'},keys:[collection.keys[0],collection.keys[2]] }); active=0;peak=0;
await Promise.all([1,2].map(() => pool.run(async () => { active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,100));active--; })));
assert.equal(peak,2);
pool = new KeyPool(collection);
const running = pool.run((_key,signal) => new Promise((resolve,reject) => signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
pool.lock(); await assert.rejects(running); assert.equal(pool.collection.keys.length,0);
pool = new KeyPool(collection); const scoped:string[]=[];
await assert.rejects(pool.run(async key => { scoped.push(key); throw Object.assign(new Error('model access denied'),{status:403}); },{model:'restricted-model',maxAttempts:5}));
assert.equal(await pool.run(async ()=>'allowed',{model:'other-model'}),'allowed');

// Real service orchestration, mocked HTTP only: preserve completed Gemma batches when rotating credentials.
const originalFetch = globalThis.fetch; let batch=0; const requests:string[]=[];
globalThis.fetch = async (input,init) => {
  const req=new Request(input,init), body=await req.json(); const key=req.headers.get('x-goog-api-key') || new URL(req.url).searchParams.get('key') || '';
  requests.push(key);
  if (requests.length===2) return Response.json({error:{code:401,message:'API key not valid',status:'UNAUTHENTICATED'}},{status:401});
  const count=batch===2?1:2, start=batch++ * 2;
  assert.ok(req.url.includes('gemma-4-31b-it'));
  return Response.json({candidates:[{content:{role:'model',parts:[{text:JSON.stringify({title:'Aljabar',questions:Array.from({length:count},(_,i)=>({question:`Berapa hasil operasi nomor ${start+i+1}?`,options:['Satu','Dua','Tiga','Empat','Lima'],correctAnswerIndex:0,explanation:'Pembahasan operasi aritmatika yang tepat.'}))})}]}}]});
};
try {
  pool=new KeyPool({...collection,keys:[collection.keys[0],collection.keys[2]]});
  const quiz=await generateQuizWithGemini({topic:'Aljabar',difficulty:'moderate',questionCount:5,timeLimitMinutes:5,language:'id',enableGrounding:false,model:'gemma-4-31b-it'},undefined,{pool});
  assert.equal(quiz.questions.length,5); assert.equal(quiz.model,'gemma-4-31b-it');
  assert.deepEqual(requests,['fake-secret-one','fake-secret-one','fake-secret-three','fake-secret-three']);
  const config={topic:'Aljabar',difficulty:'moderate' as const,questionCount:1,timeLimitMinutes:5,language:'id' as const,enableGrounding:false,model:DEFAULT_MODEL};
  const response=()=>Response.json({candidates:[{content:{role:'model',parts:[{text:JSON.stringify({title:'Latihan',questions:[{question:'Berapa hasil operasi penjumlahan dua dan dua?',options:['Empat','Dua','Tiga','Lima','Enam'],correctAnswerIndex:0,explanation:'Dua ditambah dua sama dengan empat.'}]})}]}}]});
  const modelCalls:string[]=[];
  globalThis.fetch=async(input,init)=>{const req=new Request(input,init),model=decodeURIComponent(req.url.match(/models\/([^:]+):/)?.[1]||'');modelCalls.push(model);return model===DEFAULT_MODEL?Response.json({error:{code:404,message:'Model not found',status:'NOT_FOUND'}},{status:404}):response();};
  pool=new KeyPool({...collection,keys:[collection.keys[0]]});await assert.rejects(generateQuizWithGemini(config,undefined,{pool}));assert.deepEqual(modelCalls,[DEFAULT_MODEL]);
  modelCalls.length=0;pool=new KeyPool({...collection,settings:{...defaultSettings,allowModelFallback:true},keys:[collection.keys[0]]});
  const alternate=await generateQuizWithGemini(config,undefined,{pool});assert.notEqual(alternate.model,DEFAULT_MODEL);assert.equal(modelCalls.length,2);
  const toolCalls:boolean[]=[];
  globalThis.fetch=async(input,init)=>{const req=new Request(input,init),body=await req.json(),tools=Boolean(body.tools?.length);toolCalls.push(tools);return tools?Response.json({error:{code:400,message:'googleSearch tool is unsupported',status:'INVALID_ARGUMENT'}},{status:400}):response();};
  pool=new KeyPool({...collection,keys:[collection.keys[0]]});await assert.rejects(generateQuizWithGemini({...config,enableGrounding:true},undefined,{pool}));assert.deepEqual(toolCalls,[true]);
  toolCalls.length=0;pool=new KeyPool({...collection,settings:{...defaultSettings,allowGroundingFallback:true},keys:[collection.keys[0]]});
  await assert.rejects(generateQuizWithGemini({...config,enableGrounding:true},undefined,{pool}));assert.deepEqual(toolCalls,[true]);
  toolCalls.length=0;
  globalThis.fetch=async(input,init)=>{const req=new Request(input,init),body=await req.json(),tools=Boolean(body.tools?.length);toolCalls.push(tools);return tools?Response.json({error:{code:403,message:'Grounding permission denied',status:'PERMISSION_DENIED'}},{status:403}):response();};
  pool=new KeyPool({...collection,settings:{...defaultSettings,allowGroundingFallback:true},keys:[collection.keys[0]]});
  await assert.rejects(generateQuizWithGemini({...config,enableGrounding:true},undefined,{pool}));assert.deepEqual(toolCalls,[true]);
  toolCalls.length=0;
  globalThis.fetch=async(input,init)=>{const req=new Request(input,init),body=await req.json(),tools=Boolean(body.tools?.length);toolCalls.push(tools);return tools?Response.json({error:{code:400,message:'Content blocked by safety settings',status:'INVALID_ARGUMENT'}},{status:400}):response();};
  pool=new KeyPool({...collection,settings:{...defaultSettings,allowGroundingFallback:true},keys:[collection.keys[0]]});
  await assert.rejects(generateQuizWithGemini({...config,enableGrounding:true},undefined,{pool}));assert.deepEqual(toolCalls,[true]);
} finally {globalThis.fetch=originalFetch;}
console.log('PASS multi-key: encrypted backup, migration, atomic failure, corruption, quota groups, permanent errors, budgets, cancellation, scoped access, concurrency, DST reset, Gemma batch continuation. No external API calls.');
