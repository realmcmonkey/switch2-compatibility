import test from 'node:test';
import assert from 'node:assert/strict';
import {randomToken,digest} from '../lib/auth.js';

test('the same user can flag the same approved report repeatedly and every flag enters the admin queue',async()=>{
  process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';process.env.ADMIN_DISCORD_ID='admin';
  const {default:app}=await import('../api/index.js');const member=randomToken(),admin=randomToken();const flags=[];let oldUniqueIndex=false;
  app.locals.testQuery=async(sql,args)=>{
    if(sql.startsWith('SELECT u.id'))return args[0]===digest(member)?[{id:7,discord_id:'member',role_status:'active'}]:args[0]===digest(admin)?[{id:1,discord_id:'admin',role_status:'active'}]:[];
    if(sql.startsWith('INSERT INTO flags')){if(args[2]!=='9')return {affectedRows:0};if(oldUniqueIndex&&flags.some(f=>f.report_id===9&&f.user_id===args[0])){const error=new Error('Duplicate entry');error.code='ER_DUP_ENTRY';throw error}const flag={id:flags.length+1,report_id:9,user_id:args[0],reason:args[1],status:'open'};flags.push(flag);return {affectedRows:1,insertId:flag.id}}
    if(sql.startsWith('SELECT f.*'))return flags.filter(f=>f.status==='open');throw new Error('Unexpected SQL: '+sql);
  };
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;const headers={Authorization:'Bearer '+member,Origin:'https://realmcmonkey.github.io','Content-Type':'application/json'};const send=(id,reason)=>fetch(base+'/api/reports/'+id+'/flag',{method:'POST',headers,body:JSON.stringify({reason})});
  try{assert.equal((await send(9,'Wrong result')).status,201);assert.equal((await send(9,'Wrong result')).status,201);assert.equal((await send(9,'More detail')).status,201);const queue=await fetch(base+'/api/admin/flags',{headers:{Authorization:'Bearer '+admin}});const result=await queue.json();assert.equal(result.items.length,3);assert.deepEqual(result.items.map(f=>f.reason),['Wrong result','Wrong result','More detail']);assert.equal(new Set(result.items.map(f=>f.id)).size,3);
    flags[0].status='resolved';assert.equal((await send(9,'Still wrong')).status,201);assert.equal(flags.length,4);assert.equal((await send(999,'Missing')).status,404);assert.equal((await send(9,' ')).status,400);assert.equal((await send(9,'x'.repeat(501))).status,400);
    oldUniqueIndex=true;const unmigrated=await send(9,'Another flag');assert.equal(unmigrated.status,503);assert.match((await unmigrated.json()).error,/migration 004/);
  }finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});
