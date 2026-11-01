import test from 'node:test';
import assert from 'node:assert/strict';
import {randomToken} from '../lib/auth.js';

test('pending game reports are accessible only to their owner',async()=>{
  process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';process.env.ADMIN_DISCORD_ID='admin';
  const {default:app}=await import('../api/index.js');const queries=[];const sessions=new Map();const first=randomToken(),second=randomToken();
  const {digest}=await import('../lib/auth.js');sessions.set(digest(first),1);sessions.set(digest(second),2);
  app.locals.testQuery=async(sql,args)=>{if(sql.startsWith('SELECT u.id')){const id=sessions.get(args[0]);return id?[{id,discord_id:String(id),display_name:'Tester',role_status:'active'}]:[]}queries.push({sql,args});if(sql.includes("r.status='pending'"))return args[0]===1?[{id:9,revision:'v1',emulator_id:3,emulator_name:'Emulator',result:'Playable'}]:[];throw new Error('Unexpected SQL: '+sql)};
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  try{assert.equal((await fetch(base+'/api/reports/mine?game_id=2')).status,401);const owner=await fetch(base+'/api/reports/mine?game_id=2&page=2',{headers:{Authorization:'Bearer '+first}});assert.equal(owner.status,200);assert.equal((await owner.json()).items[0].id,9);assert.match(queries[0].sql,/r\.user_id=\? AND r\.game_id=\? AND r\.status='pending'/);assert.match(queries[0].sql,/LIMIT 21 OFFSET 20$/);assert.deepEqual(queries[0].args,[1,'2']);const other=await fetch(base+'/api/reports/mine?game_id=2',{headers:{Authorization:'Bearer '+second}});assert.deepEqual((await other.json()).items,[]);assert.equal((await fetch(base+'/api/reports/mine?game_id=bad',{headers:{Authorization:'Bearer '+first}})).status,400);}finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});
