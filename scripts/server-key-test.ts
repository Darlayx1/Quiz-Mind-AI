import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { ServerKeyStore } from '../src/server/keyStore.js';
import { decryptCollection } from '../src/multiKeyVault.js';
import { encryptData,decryptData } from '../src/server/cryptoVault.js';
const dir=mkdtempSync(path.join(tmpdir(),'quizmind-vault-test-'));
const password='fake-owner-login-password',salt=randomBytes(16);
const env={VAULT_USERNAME:'tester',VAULT_PASSWORD_HASH:`scrypt$${salt.toString('hex')}$${scryptSync(password,salt,64).toString('hex')}`,ENCRYPTION_SECRET:'fake-only-test-encryption-secret-32-characters',DATA_DIR:dir,NODE_ENV:'test'};
let store=new ServerKeyStore(env); const app=express();app.use(express.json());store.install(app);
app.post('/generate',async (req,res)=>{const result=await store.generation(req,res,async pool=>pool.collection.keys.length);if(!res.headersSent)res.json({result});});
const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.on('listening',resolve));
const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
let cookie='',csrf='';
const call=(route:string,body?:unknown,extra:Record<string,string>={})=>fetch(base+'/api/keys/'+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(csrf?{'x-vault-csrf':csrf}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
try {
  assert.throws(()=>encryptData('test','short'));const encrypted=encryptData('test',env.ENCRYPTION_SECRET);assert.equal(decryptData(encrypted,env.ENCRYPTION_SECRET),'test');assert.throws(()=>decryptData(encrypted,'wrong-encryption-secret-with-32-chars'));
  assert.equal((await call('session')).status,401);
  assert.equal((await call('login',{username:'tester',password:'bad-password'})).status,401);
  assert.equal((await call('login',{username:'tester',password},{origin:'https://hostile.test'})).status,403);
  let res=await call('login',{username:'tester',password});assert.equal(res.status,200);
  cookie=res.headers.get('set-cookie')!.split(';')[0];assert.ok(res.headers.get('set-cookie')!.includes('HttpOnly'));assert.ok(res.headers.get('set-cookie')!.includes('SameSite=Strict'));
  let data=await res.json();csrf=data.csrf;assert.equal(data.revision,0);
  const key={id:'one',name:'Utama',project:'my-project',key:'fake-stored-server-key',enabled:true,priority:1};
  assert.equal((await call('add',{keys:[key],revision:0},{'x-vault-csrf':'incorrect'})).status,403);
  res=await call('add',{keys:[key],revision:0});assert.equal(res.status,200);data=await res.json();assert.equal(data.revision,1);assert.equal(JSON.stringify(data).includes(key.key),false);assert.equal(data.keys[0].health.state,'untested');
  await store.pool().run(async () => ({ usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 } }));
  res=await call('session');data=await res.json();assert.equal(data.monitoring.usage.one.totalTokens,6);assert.equal(JSON.stringify(data).includes(key.key),false);
  assert.equal((await call('add',{keys:[{...key,id:'two'}],revision:1})).status,400);
  assert.equal((await call('update',{id:'one',patch:{name:'new'},revision:0})).status,409);
  res=await call('update',{id:'one',patch:{priority:2},revision:1});assert.equal(res.status,200);data=await res.json();assert.equal(data.revision,2);
  res=await call('export',{password:'fake-backup-password'});const backup=(await res.json()).backup;assert.equal(backup.includes(key.key),false);assert.equal((await decryptCollection(backup,'fake-backup-password')).keys[0].key,key.key);
  const disk=Buffer.concat(readdirSync(dir).filter(f=>f.startsWith('keys.sqlite')).map(f=>readFileSync(path.join(dir,f))));assert.equal(disk.includes(Buffer.from(key.key)),false);
  assert.equal((await fetch(base+'/generate',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(base+'/generate',{method:'POST',headers:{'content-type':'application/json',cookie},body:'{}'})).status,403);
  res=await fetch(base+'/generate',{method:'POST',headers:{'content-type':'application/json',cookie,'x-vault-csrf':csrf},body:'{}'});assert.equal(res.status,200);assert.equal((await res.json()).result,1);
  assert.equal((await call('logout',{})).status,200);assert.equal((await call('session')).status,401);
  res=await call('login',{username:'tester',password});cookie=res.headers.get('set-cookie')!.split(';')[0];csrf=(await res.json()).csrf;
  const activeSession=store.session({headers:{cookie}} as any)!;const actualNow=Date.now;
  try {Date.now=()=>actualNow()+16*60_000;assert.equal(store.session({headers:{cookie}} as any),undefined);assert.equal(activeSession.controller.signal.aborted,true);}finally{Date.now=actualNow;}
  store.close();store=new ServerKeyStore(env);assert.equal(store.pool().collection.keys[0].key,key.key);assert.equal(store.metadata().revision,2);
  // Restart invalidates sessions; encrypted data survives.
  assert.equal(store.session({headers:{cookie}} as any),undefined);
} finally {
  store.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep));assert.ok(path.basename(resolved).startsWith('quizmind-vault-test-'));rmSync(resolved,{recursive:true,force:true});
}
console.log('PASS server vault: login, hostile origin, HttpOnly cookie, CSRF, encrypted persistence, no plaintext responses/disk, duplicate rejection, conflict detection, portable encrypted export, fail-closed encryption, restart persistence. No external API calls.');
