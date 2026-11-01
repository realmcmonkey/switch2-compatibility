import test from 'node:test';
import assert from 'node:assert/strict';
import {entrySchema} from '../lib/security.js';
import {randomToken} from '../lib/auth.js';

test('recommended games are unique, bounded positive integers',()=>{
  const entry={kind:'emulator',name:'Example'};
  assert.equal(entrySchema.safeParse({...entry,recommended_game_ids:[1,2]}).success,true);
  for(const ids of [[1,1],[0],[-1],[1.5],['1'],Array.from({length:21},(_,i)=>i+1)])assert.equal(entrySchema.safeParse({...entry,recommended_game_ids:ids}).success,false);
});

test('public profiles return pending and approved reports; recommendations validate catalog games',async()=>{
  process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';process.env.ADMIN_DISCORD_ID='123';
  const {default:app}=await import('../api/index.js');const calls=[];
  app.locals.testQuery=async(sql,args)=>{
    if(sql.startsWith('SELECT u.id'))return [{id:1,discord_id:'123',display_name:'Admin',role_status:'active'}];
    calls.push({sql,args});
    if(sql.startsWith('SELECT id,display_name FROM users'))return args[0]==='1'?[{id:1,display_name:'Tester'}]:[];
    if(sql.includes("r.status IN ('pending','approved')"))return [{id:4,game_id:2,emulator_id:3,game_name:'Game',emulator_name:'Emulator',result:'Playable'}];
    if(sql.startsWith('SELECT * FROM entries'))return [{id:3,owner_id:1,kind:'emulator',recommended_game_ids:null}];
    if(sql.startsWith("SELECT id FROM entries WHERE kind='game'"))return args.filter(x=>x===2).map(id=>({id}));
    if(sql.startsWith('SELECT e.*'))return [{id:3,kind:'emulator',recommended_game_ids:'[2]'}];
    if(sql.startsWith("SELECT id,name,image_url FROM entries WHERE kind='game'"))return [{id:2,name:'Game'}];
    return {insertId:3,affectedRows:1};
  };
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;const headers={Authorization:'Bearer '+randomToken(),Origin:'https://realmcmonkey.github.io','Content-Type':'application/json'};
  try{
    const profile=await fetch(base+'/api/users/1?page=2');assert.equal(profile.status,200);const data=await profile.json();assert.deepEqual(data.user,{id:1,display_name:'Tester'});assert.equal(data.items[0].game_name,'Game');const sql=calls.find(c=>c.sql.includes("r.status IN ('pending','approved')"));assert.match(sql.sql,/LIMIT 21 OFFSET 20$/);assert.deepEqual(sql.args,['1']);
    assert.equal((await fetch(base+'/api/users/999')).status,404);
    const detail=await (await fetch(base+'/api/entries/3')).json();assert.deepEqual(detail.recommended_games,[{id:2,name:'Game'}]);assert.equal('recommended_game_ids' in detail,false);
    const entry={kind:'emulator',name:'Example',recommended_game_ids:[2]};assert.equal((await fetch(base+'/api/entries/3',{method:'PUT',headers,body:JSON.stringify(entry)})).status,200);const update=calls.find(c=>c.sql.startsWith('UPDATE entries'));assert.match(update.sql,/recommended_game_ids=\?/);assert.ok(update.args.includes('[2]'));
    assert.equal((await fetch(base+'/api/entries/3',{method:'PUT',headers,body:JSON.stringify({...entry,recommended_game_ids:[99]})})).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});
