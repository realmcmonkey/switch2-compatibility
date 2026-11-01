import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGitHubRepository,githubMetadata,readmeMetadata} from '../lib/github.js';
import {entrySchema} from '../lib/security.js';
import {randomToken} from '../lib/auth.js';

test('repository URL validation accepts repository pages and rejects unrelated URLs',()=>{
  assert.deepEqual(parseGitHubRepository('https://github.com/Owner/Emulator.git/'),{owner:'Owner',repo:'Emulator',url:'https://github.com/Owner/Emulator'});
  for(const value of ['http://github.com/a/b','https://github.com.evil.test/a/b','https://user@github.com/a/b','https://github.com/a/b/issues','https://github.com/a/b?next=1','https://github.com/a/b#x','https://github.com/a','https://github.com/a/%2fetc'])assert.equal(parseGitHubRepository(value),null,value);
  assert.equal(entrySchema.safeParse({kind:'emulator',name:'Example',github_url:'https://evil.test/a/b'}).success,false);
  assert.equal(entrySchema.safeParse({kind:'emulator',name:'Example'}).success,true);
});

test('metadata uses public GitHub endpoints, accepts missing release and reports lookup failure',async()=>{
  const original=globalThis.fetch,urls=[];
  try{globalThis.fetch=async url=>{urls.push(url);if(urls.length===1)return new Response(JSON.stringify({name:'Emulator',description:'Description',owner:{avatar_url:'https://avatars.githubusercontent.com/u/42'}}));return new Response('',{status:404})};
    const metadata=await githubMetadata('https://github.com/Owner/Emulator');assert.equal(metadata.name,'Emulator');assert.equal(metadata.description,'Description');assert.equal(metadata.image_url,'https://avatars.githubusercontent.com/u/42');assert.equal(metadata.versions,'');assert.equal(metadata.github_url,'https://github.com/Owner/Emulator');assert.ok(urls.includes('https://api.github.com/repos/Owner/Emulator/releases/latest'));
    globalThis.fetch=async url=>String(url).endsWith('/latest')?new Response(JSON.stringify({tag_name:'v2.0'})):String(url).endsWith('/Emulator')?new Response(JSON.stringify({name:'Emulator',owner:{avatar_url:'https://evil.test/avatar'}})):new Response('',{status:404});
    const latest=await githubMetadata('https://github.com/Owner/Emulator');assert.equal(latest.versions,'v2.0');assert.equal(latest.image_url,'');
    globalThis.fetch=async()=>new Response('',{status:403});await assert.rejects(githubMetadata('https://github.com/Owner/Emulator'),/manually/);
  }finally{globalThis.fetch=original;}
});

test('README fallback extracts source-backed information when the GitHub API is unavailable',async()=>{
  const original=globalThis.fetch;const urls=[];
  try{globalThis.fetch=async url=>{urls.push(String(url));return String(url).endsWith('/HEAD/README.md')?new Response('# Example Emulator\n\nExample Emulator runs games on\ncompatible computers.\n\n![Example logo](assets/logo.png)\n\nLatest release: v1.2.3'):new Response('',{status:403})};
    const result=await githubMetadata('https://github.com/Owner/Emulator');assert.equal(result.name,'Example Emulator');assert.equal(result.description,'Example Emulator runs games on compatible computers.');assert.equal(result.versions,'v1.2.3');assert.equal(result.image_url,'https://raw.githubusercontent.com/Owner/Emulator/HEAD/assets/logo.png');assert.equal(result.metadataUnavailable,true);assert.equal(result.readmeUsed,true);assert.ok(urls.some(url=>url.endsWith('/HEAD/README.md')));
    const unsafe=readmeMetadata('# Emulator\n\nA longer description of this emulator for users.\n\n![logo](https://evil.test/logo.png)',{owner:'Owner',repo:'Emulator'});assert.equal(unsafe.image_url,'');
  }finally{globalThis.fetch=original;}
});

test('entry API stores and updates repository URLs without discarding legacy emulator information',async()=>{
  process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';process.env.ADMIN_DISCORD_ID='123';
  const {default:app}=await import('../api/index.js');const calls=[];
  app.locals.testQuery=async(sql,args)=>{if(sql.startsWith('SELECT u.id'))return [{id:1,discord_id:'123',display_name:'Admin',role_status:'active'}];if(sql.startsWith('SELECT * FROM entries'))return [{id:5,owner_id:1,kind:'emulator',wikipedia_url:'https://en.wikipedia.org/wiki/Old'}];calls.push({sql,args});return {insertId:10,affectedRows:1}};
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;const headers={Authorization:'Bearer '+randomToken(),Origin:'https://realmcmonkey.github.io','Content-Type':'application/json'};
  try{
    const data={kind:'emulator',name:'Old',wikipedia_url:'https://en.wikipedia.org/wiki/Old',github_url:'https://github.com/Owner/Emulator.git',official_url:'https://example.com'};
    assert.equal((await fetch(base+'/api/entries/5',{method:'PUT',headers,body:JSON.stringify(data)})).status,200);let update=calls.find(x=>x.sql.startsWith('UPDATE entries'));assert.match(update.sql,/github_url=\?/);assert.ok(update.args.includes('https://github.com/Owner/Emulator'));assert.ok(update.args.includes(data.wikipedia_url));
    calls.length=0;delete data.github_url;assert.equal((await fetch(base+'/api/entries/5',{method:'PUT',headers,body:JSON.stringify(data)})).status,200);update=calls.find(x=>x.sql.startsWith('UPDATE entries'));assert.doesNotMatch(update.sql,/github_url/);
    calls.length=0;data.github_url='https://github.com/Owner/Emulator';assert.equal((await fetch(base+'/api/entries',{method:'POST',headers,body:JSON.stringify(data)})).status,201);assert.match(calls[0].sql,/github_url/);
    data.github_url='https://evil.test/repo';assert.equal((await fetch(base+'/api/entries',{method:'POST',headers,body:JSON.stringify(data)})).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});

test('repository lookup and writes reject duplicates while allowing an entry to retain its own repository',async()=>{
  process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';process.env.ADMIN_DISCORD_ID='123';
  const {default:app}=await import('../api/index.js');let writes=0;const lookups=[];
  app.locals.testQuery=async(sql,args)=>{
    if(sql.startsWith('SELECT u.id'))return [{id:1,discord_id:'123',display_name:'Admin',role_status:'active'}];
    if(sql.startsWith('SELECT id,name FROM entries')){lookups.push(args);return args[2]&&Number(args[2])===77?[]:[{id:77,name:'Existing Emulator'}]}
    if(sql.startsWith('SELECT * FROM entries'))return [{id:77,owner_id:1,kind:'emulator'}];
    if(sql.startsWith('INSERT INTO entries')||sql.startsWith('UPDATE entries'))writes++;
    return {insertId:78,affectedRows:1};
  };
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;const headers={Authorization:'Bearer '+randomToken(),Origin:'https://realmcmonkey.github.io','Content-Type':'application/json'};
  try{
    const lookup=await fetch(base+'/api/emulators/repository?url='+encodeURIComponent('https://github.com/OWNER/Repo.git/'));assert.deepEqual((await lookup.json()).existing,{id:77,name:'Existing Emulator'});assert.deepEqual(lookups[0],['https://github.com/owner/repo','https://github.com/owner/repo.git']);
    const entry={kind:'emulator',name:'Different Name',github_url:'https://github.com/Owner/Repo'};
    const duplicate=await fetch(base+'/api/entries',{method:'POST',headers,body:JSON.stringify(entry)});assert.equal(duplicate.status,409);assert.equal((await duplicate.json()).existing.id,77);assert.equal(writes,0);
    const edit=await fetch(base+'/api/entries/77',{method:'PUT',headers,body:JSON.stringify(entry)});assert.equal(edit.status,200);assert.equal(writes,1);assert.equal(lookups.at(-1)[2],77);
    assert.equal((await fetch(base+'/api/emulators/repository?url='+encodeURIComponent('https://evil.test/x/y'))).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});

test('missing emulator database columns return a clear migration error',async()=>{
  process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';
  const {default:app}=await import('../api/index.js');app.locals.testQuery=async()=>{const error=new Error("Unknown column 'github_url' in 'where clause'");error.code='ER_BAD_FIELD_ERROR';throw error};
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  try{const response=await fetch(base+'/api/emulators/repository?url='+encodeURIComponent('https://github.com/0x2593/Eden-NS2'));assert.equal(response.status,503);const result=await response.json();assert.equal(result.code,'MIGRATION_REQUIRED');assert.match(result.error,/migrations 002 and 003/);}finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});
