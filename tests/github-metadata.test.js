import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGitHubRepository,githubMetadata} from '../lib/github.js';
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
  try{globalThis.fetch=async url=>{urls.push(url);return urls.length===1?new Response(JSON.stringify({name:'Emulator',description:'Description',owner:{avatar_url:'https://avatars.githubusercontent.com/u/42'}})):new Response('',{status:404})};
    const metadata=await githubMetadata('https://github.com/Owner/Emulator');assert.equal(metadata.name,'Emulator');assert.equal(metadata.description,'Description');assert.equal(metadata.image_url,'https://avatars.githubusercontent.com/u/42');assert.equal(metadata.versions,'');assert.equal(metadata.github_url,'https://github.com/Owner/Emulator');assert.deepEqual(urls,['https://api.github.com/repos/Owner/Emulator','https://api.github.com/repos/Owner/Emulator/releases/latest']);
    globalThis.fetch=async url=>String(url).endsWith('/latest')?new Response(JSON.stringify({tag_name:'v2.0'})):new Response(JSON.stringify({name:'Emulator',owner:{avatar_url:'https://evil.test/avatar'}}));
    const latest=await githubMetadata('https://github.com/Owner/Emulator');assert.equal(latest.versions,'v2.0');assert.equal(latest.image_url,'');
    globalThis.fetch=async()=>new Response('',{status:403});await assert.rejects(githubMetadata('https://github.com/Owner/Emulator'),/manually/);
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
