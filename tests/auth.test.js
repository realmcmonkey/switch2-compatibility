import test from 'node:test';
import assert from 'node:assert/strict';
import {randomToken,digest,challengeFor,fixedFrontend,bearer,consumeHandoff} from '../lib/auth.js';

test('redirect configuration and bearer tokens are strictly validated',()=>{
  assert.equal(fixedFrontend('https://realmcmonkey.github.io/switch2-compatibility/'),'https://realmcmonkey.github.io/switch2-compatibility/');
  for(const bad of ['https://example.com/?next=https://evil.test','https://example.com/#x','https://user:pass@example.com/','http://example.com/']) assert.throws(()=>fixedFrontend(bad));
  const token=randomToken();assert.equal(bearer('Bearer '+token),token);assert.equal(bearer('Bearer '+token+'x'),null);
});

test('handoff requires the matching verifier and state and can be consumed once, even concurrently',async()=>{
  const code=randomToken(),verifier=randomToken(),state=randomToken();let used=false;
  const query=async(sql,args)=>{if(sql.startsWith('UPDATE')){if(used||args[0]!==digest(code)||args[1]!==challengeFor(verifier)||args[2]!==digest(state))return {affectedRows:0};used=true;return {affectedRows:1}}return [{user_id:7}]};
  assert.equal(await consumeHandoff(query,code,randomToken(),state),null);
  assert.equal(await consumeHandoff(query,code,verifier,randomToken()),null);
  assert.deepEqual((await Promise.all([consumeHandoff(query,code,verifier,state),consumeHandoff(query,code,verifier,state)])).sort(),[7,null].sort());
  assert.equal(await consumeHandoff(query,code,verifier,state),null);
});

test('OAuth handoff, API authorization, origin protection, replay and logout',async()=>{
  process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';process.env.DISCORD_CLIENT_ID='client';process.env.DISCORD_CLIENT_SECRET='secret';process.env.DISCORD_REDIRECT_URI='https://api.example.test/api/auth/callback';process.env.ADMIN_DISCORD_ID='123';
  const {default:app}=await import('../api/index.js');const records={handoffs:[],sessions:[]};
  app.locals.testQuery=async(sql,args)=>{
    if(sql.startsWith('INSERT INTO auth_handoffs')){records.handoffs.push({id:1,discord:args[0],stateHash:args[1],state:args[2],challenge:args[3],status:'started',expired:false});return {affectedRows:1}}
    if(sql.includes("SET status='processing'")){const h=records.handoffs.find(x=>x.discord===args[0]&&x.status==='started'&&!x.expired);if(!h)return {affectedRows:0};h.status='processing';return {affectedRows:1}}
    if(sql.startsWith('SELECT id,client_state')){const h=records.handoffs.find(x=>x.discord===args[0]);return [{id:h.id,client_state:h.state}]}
    if(sql.startsWith('INSERT INTO users'))return {affectedRows:1};
    if(sql.startsWith('SELECT id FROM users'))return [{id:1}];
    if(sql.includes("SET status='ready'")){const h=records.handoffs.find(x=>x.id===args[2]);Object.assign(h,{code:args[0],user:args[1],status:'ready'});return {affectedRows:1}}
    if(sql.includes("SET status='consumed'")){const h=records.handoffs.find(x=>x.code===args[0]&&x.challenge===args[1]&&x.stateHash===args[2]&&x.status==='ready'&&!x.expired);if(!h)return {affectedRows:0};h.status='consumed';return {affectedRows:1}}
    if(sql.startsWith('SELECT user_id FROM auth_handoffs'))return records.handoffs.filter(x=>x.code===args[0]&&x.status==='consumed').map(x=>({user_id:x.user}));
    if(sql.startsWith('INSERT INTO auth_sessions')){records.sessions.push({hash:args[0],user:args[1]});return {affectedRows:1}}
    if(sql.startsWith('SELECT u.id'))return records.sessions.some(x=>x.hash===args[0])?[{id:1,discord_id:'123',display_name:'Monkey',role_status:'active'}]:[];
    if(sql.startsWith('DELETE FROM auth_sessions')){records.sessions=records.sessions.filter(x=>x.hash!==args[0]);return {affectedRows:1}}
    if(sql.includes('FROM moderation_log'))return [];
    throw new Error('Unexpected SQL: '+sql);
  };
  const realFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url).startsWith('https://discord.com/api/oauth2/token')?new Response(JSON.stringify({access_token:'discord-token'})):String(url).startsWith('https://discord.com/api/users/@me')?new Response(JSON.stringify({id:'123',username:'Monkey'})):realFetch(url,options);
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;const origin='https://realmcmonkey.github.io';
  try{
    const verifier=randomToken(),state=randomToken();
    const start=await realFetch(base+'/api/auth/login?'+new URLSearchParams({challenge:challengeFor(verifier),state}),{redirect:'manual'});assert.equal(start.status,302);
    const discordState=new URL(start.headers.get('location')).searchParams.get('state');
    const callback=await realFetch(base+'/api/auth/callback?'+new URLSearchParams({code:'discord-code',state:discordState}),{redirect:'manual'});assert.equal(callback.status,302);
    const target=new URL(callback.headers.get('location'));assert.equal(target.origin+target.pathname,process.env.FRONTEND_URL);const params=new URLSearchParams(target.hash.split('?')[1]);assert.equal(params.get('state'),state);assert.equal(target.search,'');
    const replayCallback=await realFetch(base+'/api/auth/callback?'+new URLSearchParams({code:'discord-code',state:discordState}),{redirect:'manual'});assert.equal(replayCallback.status,400);
    const body=JSON.stringify({code:params.get('code'),state,verifier});const headers={'Content-Type':'application/json',Origin:origin};
    assert.equal((await realFetch(base+'/api/auth/exchange',{method:'POST',headers:{...headers,Origin:'https://evil.test'},body})).status,403);
    assert.equal((await realFetch(base+'/api/auth/exchange',{method:'POST',headers,body:JSON.stringify({code:params.get('code'),state,verifier:randomToken()})})).status,400);
    const exchange=await realFetch(base+'/api/auth/exchange',{method:'POST',headers,body});assert.equal(exchange.status,200);assert.equal(exchange.headers.get('cache-control'),'no-store');const {session}=await exchange.json();assert.equal(records.sessions[0].hash,digest(session));
    assert.equal((await realFetch(base+'/api/auth/exchange',{method:'POST',headers,body})).status,400);
    const authHeaders={Authorization:'Bearer '+session,Origin:origin};const me=await (await realFetch(base+'/api/me',{headers:authHeaders})).json();assert.equal(me.user.is_admin,true);
    assert.equal((await realFetch(base+'/api/admin/history',{headers:authHeaders})).status,200);
    assert.equal((await realFetch(base+'/api/auth/logout',{method:'POST',headers:authHeaders})).status,200);
    assert.equal((await (await realFetch(base+'/api/me',{headers:authHeaders})).json()).user,null);
    assert.equal((await realFetch(base+'/api/admin/history',{headers:authHeaders})).status,401);
    const expiredState=randomToken(),expiredVerifier=randomToken();
    const expiredStart=await realFetch(base+'/api/auth/login?'+new URLSearchParams({challenge:challengeFor(expiredVerifier),state:expiredState}),{redirect:'manual'});
    const expiredDiscordState=new URL(expiredStart.headers.get('location')).searchParams.get('state');records.handoffs.at(-1).expired=true;
    assert.equal((await realFetch(base+'/api/auth/callback?'+new URLSearchParams({code:'discord-code',state:expiredDiscordState}),{redirect:'manual'})).status,400);
    const expiredCode=randomToken();records.handoffs.push({code:digest(expiredCode),challenge:challengeFor(expiredVerifier),stateHash:digest(expiredState),status:'ready',expired:true});
    assert.equal((await realFetch(base+'/api/auth/exchange',{method:'POST',headers,body:JSON.stringify({code:expiredCode,state:expiredState,verifier:expiredVerifier})})).status,400);
  }finally{globalThis.fetch=realFetch;await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});
