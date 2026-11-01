import test from 'node:test';
import assert from 'node:assert/strict';
import {randomToken,digest} from '../lib/auth.js';

test('approval publishes and leaves the queue; denial deletes report, flags, and related history',async()=>{
  process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';process.env.ADMIN_DISCORD_ID='admin';
  const {default:app}=await import('../api/index.js');const admin=randomToken(),member=randomToken();const reports=new Map([[11,{id:11,user_id:2,status:'pending',game_id:5}],[22,{id:22,user_id:2,status:'pending',game_id:5}]]);let flags=[{id:70,report_id:22}];let history=[{type:'report',id:22},{type:'flag',id:70}];const executed=[];
  app.locals.testQuery=async(sql,args)=>{
    if(sql.startsWith('SELECT u.id'))return args[0]===digest(admin)?[{id:1,discord_id:'admin',role_status:'active'}]:args[0]===digest(member)?[{id:2,discord_id:'member',role_status:'active'}]:[];
    executed.push({sql,args});
    if(sql.startsWith('SELECT r.*')&&sql.includes("WHERE r.status='pending'"))return [...reports.values()].filter(r=>r.status==='pending');
    if(sql.startsWith('SELECT r.*')&&sql.includes("r.status='approved'"))return [...reports.values()].filter(r=>r.status==='approved'&&r.game_id===Number(args[0]));
    if(sql.startsWith("UPDATE reports SET status='approved'")){const report=reports.get(Number(args[0]));if(!report||report.status!=='pending')return {affectedRows:0};report.status='approved';return {affectedRows:1}}
    if(sql.startsWith('INSERT INTO moderation_log')){history.push({type:args[2],id:Number(args[3]),details:args[4]});return {affectedRows:1}}
    if(sql.startsWith('SELECT g.name game_name'))return reports.has(Number(args[0]))?[{game_name:'Game',emulator_name:'Emulator',tester_name:'Tester',result:'Playable',revision:'v1'}]:[];
    if(sql.startsWith('SELECT id FROM reports WHERE id=? FOR UPDATE')){const report=reports.get(Number(args[0]));return report?[{id:report.id}]:[]}
    if(sql.startsWith("DELETE FROM moderation_log WHERE target_type='flag'")){const ids=flags.filter(f=>f.report_id===Number(args[0])).map(f=>f.id);history=history.filter(h=>h.type!=='flag'||!ids.includes(h.id));return {affectedRows:1}}
    if(sql.startsWith("DELETE FROM moderation_log WHERE target_type='report'")){history=history.filter(h=>h.type!=='report'||h.id!==Number(args[0]));return {affectedRows:1}}
    if(sql.startsWith('DELETE FROM flags')){flags=flags.filter(f=>f.report_id!==Number(args[0]));return {affectedRows:1}}
    if(sql.startsWith('DELETE FROM reports')){reports.delete(Number(args[0]));return {affectedRows:1}}
    if(sql.startsWith('SELECT * FROM reports')){const report=reports.get(Number(args[0]));return report?[report]:[]}
    throw new Error('Unexpected SQL: '+sql);
  };
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;const headers=token=>({Authorization:'Bearer '+token,Origin:'https://realmcmonkey.github.io'});
  try{
    assert.equal((await fetch(base+'/api/admin/report/11/approve',{method:'POST',headers:headers(member)})).status,403);
    assert.deepEqual((await (await fetch(base+'/api/admin/reports',{headers:headers(admin)})).json()).items.map(r=>r.id),[11,22]);
    assert.equal((await fetch(base+'/api/admin/report/11/approve',{method:'POST',headers:headers(admin)})).status,200);
    assert.equal(reports.get(11).status,'approved');assert.deepEqual(JSON.parse(history.find(h=>h.id===11).details),{game:'Game',emulator:'Emulator',tester:'Tester',result:'Playable',revision:'v1'});assert.deepEqual((await (await fetch(base+'/api/admin/reports',{headers:headers(admin)})).json()).items.map(r=>r.id),[22]);
    assert.deepEqual((await (await fetch(base+'/api/reports?game_id=5')).json()).items.map(r=>r.id),[11]);assert.equal((await fetch(base+'/api/admin/report/11/approve',{method:'POST',headers:headers(admin)})).status,409);
    assert.equal((await fetch(base+'/api/admin/report/22/reject',{method:'POST',headers:headers(admin)})).status,200);assert.equal(reports.has(22),false);assert.deepEqual(flags,[]);assert.ok(history.every(h=>h.id!==22&&h.id!==70));assert.deepEqual((await (await fetch(base+'/api/admin/reports',{headers:headers(admin)})).json()).items,[]);assert.equal((await fetch(base+'/api/reports/22',{headers:headers(member)})).status,404);assert.equal((await fetch(base+'/api/admin/report/22/reject',{method:'POST',headers:headers(admin)})).status,404);
    assert.ok(executed.some(q=>q.sql.includes("target_type='flag'")));assert.ok(executed.some(q=>q.sql.includes("target_type='report'")));
  }finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});
