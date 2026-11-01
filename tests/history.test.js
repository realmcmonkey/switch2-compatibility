import test from 'node:test';
import assert from 'node:assert/strict';
import {describeHistory,reportSnapshot,entrySnapshot} from '../lib/history.js';
import {historyQuery} from '../lib/history-query.js';
import {pagination} from '../lib/pagination.js';
import {randomToken,digest} from '../lib/auth.js';

test('history shows recognizable report and entry details, with honest fallbacks',()=>{
  const saved=reportSnapshot({game_name:'Mario Kart World',emulator_name:'Eden',tester_name:'Monkey',result:'Playable',revision:'v1'});
  assert.deepEqual(describeHistory({action:'approve',target_type:'report',target_id:1,details:saved}),{title:'Approved report: Mario Kart World · Eden',context:'Tester: Monkey · Result: Playable · Revision: v1'});
  assert.deepEqual(describeHistory({action:'edit',target_type:'report',target_id:2,details:'',game_name:'Game',emulator_name:'Emulator',tester_name:'Tester'}),{title:'Edited report: Game · Emulator',context:'Tester: Tester'});
  assert.match(describeHistory({action:'delete',target_type:'report',target_id:3,details:''}).title,/Report #3 \(details unavailable\)/i);
  assert.deepEqual(describeHistory({action:'delete',target_type:'entry',target_id:4,details:entrySnapshot({name:'Eden',kind:'emulator'},'Removed 2 associated reports')}),{title:'Deleted emulator: Eden',context:'Removed 2 associated reports'});
});

test('history searches and sorts across the full result set with bound input and bounded pagination',()=>{
  const q=historyQuery({game:"Mario%'_!",emulator:'Eden',sort:'emulator'},pagination('2',20));
  assert.deepEqual(q.args,["%Mario!%'!_!!%",'%Eden%']);assert.ok(!q.sql.includes("Mario%'_!"));assert.match(q.sql,/JSON_VALID\(l\.details\)/);assert.match(q.sql,/LEFT JOIN reports/);assert.match(q.sql,/ORDER BY history_emulator IS NULL, history_emulator ASC, l\.id DESC LIMIT 21 OFFSET 20$/);
  assert.match(historyQuery({sort:'game'},pagination('1',20)).sql,/ORDER BY history_game IS NULL, history_game ASC/);assert.match(historyQuery({sort:'oldest'},pagination('1',20)).sql,/ORDER BY l\.id ASC/);
  assert.throws(()=>historyQuery({sort:'id; DROP TABLE users'},pagination('1',20)),error=>error.status===400);assert.throws(()=>historyQuery({game:'x'.repeat(101)},pagination('1',20)),error=>error.status===400);
});

test('history API restricts access and applies search and sorting before pagination',async()=>{
  process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';process.env.ADMIN_DISCORD_ID='admin';const {default:app}=await import('../api/index.js');const admin=randomToken(),member=randomToken();const calls=[];
  app.locals.testQuery=async(sql,args)=>{if(sql.startsWith('SELECT u.id'))return args[0]===digest(admin)?[{id:1,discord_id:'admin',role_status:'active'}]:args[0]===digest(member)?[{id:2,discord_id:'member',role_status:'active'}]:[];calls.push({sql,args});return [{id:1,action:'approve',target_type:'report',target_id:1,game_name:'Game',emulator_name:'Emulator'}]};
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;const url=base+'/api/admin/history?game=Game&emulator=Emulator&sort=game&page=2';
  try{assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+member}})).status,403);const response=await fetch(url,{headers:{Authorization:'Bearer '+admin}});assert.equal(response.status,200);assert.deepEqual(calls[0].args,['%Game%','%Emulator%']);assert.match(calls[0].sql,/ORDER BY history_game IS NULL, history_game ASC, l\.id DESC LIMIT 21 OFFSET 20$/);assert.equal((await fetch(base+'/api/admin/history?sort=invalid',{headers:{Authorization:'Bearer '+admin}})).status,400);}finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});
