import test from 'node:test';
import assert from 'node:assert/strict';
import {randomToken,digest} from '../lib/auth.js';

test('only admins can deny a single flag or approve it and delete the report and related flags',async()=>{
 process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';process.env.ADMIN_DISCORD_ID='admin';
 const {default:app}=await import('../api/index.js');const admin=randomToken(),member=randomToken();let flags=[{id:1,report_id:9},{id:2,report_id:9},{id:3,report_id:10}];let reports=[9,10];let history=[{type:'flag',id:1},{type:'flag',id:2},{type:'report',id:9}];
 app.locals.testQuery=async(sql,args)=>{
  if(sql.startsWith('SELECT u.id'))return args[0]===digest(admin)?[{id:1,discord_id:'admin',role_status:'active'}]:args[0]===digest(member)?[{id:2,discord_id:'member',role_status:'active'}]:[];
  if(sql.startsWith('SELECT id,report_id FROM flags'))return flags.filter(f=>f.id===Number(args[0]));
  if(sql.startsWith("DELETE FROM moderation_log WHERE target_type='flag' AND target_id IN")){const ids=flags.filter(f=>f.report_id===Number(args[0])).map(f=>f.id);history=history.filter(h=>h.type!=='flag'||!ids.includes(h.id));return {affectedRows:1}}
  if(sql.startsWith("DELETE FROM moderation_log WHERE target_type='flag'")){history=history.filter(h=>h.type!=='flag'||h.id!==Number(args[0]));return {affectedRows:1}}
  if(sql.startsWith("DELETE FROM moderation_log WHERE target_type='report'")){history=history.filter(h=>h.type!=='report'||h.id!==Number(args[0]));return {affectedRows:1}}
  if(sql.startsWith('DELETE FROM flags WHERE report_id=')){flags=flags.filter(f=>f.report_id!==Number(args[0]));return {affectedRows:1}}
  if(sql.startsWith('DELETE FROM flags WHERE id=')){flags=flags.filter(f=>f.id!==Number(args[0]));return {affectedRows:1}}
  if(sql.startsWith('DELETE FROM reports')){reports=reports.filter(id=>id!==Number(args[0]));return {affectedRows:1}}
  throw new Error('Unexpected SQL: '+sql);
 };
 const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;const send=(id,decision,token=admin)=>fetch(base+'/api/admin/flag/'+id+'/'+decision,{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://realmcmonkey.github.io'}});
 try{assert.equal((await send(1,'deny',member)).status,403);assert.equal((await send(1,'deny')).status,200);assert.deepEqual(flags.map(f=>f.id),[2,3]);assert.deepEqual(reports,[9,10]);assert.equal(history.some(h=>h.type==='flag'&&h.id===1),false);assert.equal((await send(1,'deny')).status,404);assert.equal((await send(2,'approve')).status,200);assert.deepEqual(reports,[10]);assert.deepEqual(flags.map(f=>f.id),[3]);assert.deepEqual(history,[]);assert.equal((await send(3,'resolve')).status,400);}finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});
