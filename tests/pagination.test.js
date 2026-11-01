import test from 'node:test';
import assert from 'node:assert/strict';
import {pagination} from '../lib/pagination.js';
import {randomToken} from '../lib/auth.js';

test('pagination strictly validates page numbers and bounds literal SQL',()=>{
  assert.deepEqual(pagination(undefined,24),{page:1,offset:0,sql:'LIMIT 25 OFFSET 0'});
  assert.deepEqual(pagination('2',24),{page:2,offset:24,sql:'LIMIT 25 OFFSET 24'});
  assert.deepEqual(pagination('100000',20),{page:100000,offset:1999980,sql:'LIMIT 21 OFFSET 1999980'});
  for(const invalid of ['','0','-1','+1','01','1.5','1e2','2abc',' 2','100001','999999999999999999999','1; DROP TABLE users', ['1','2'],null]) {
    assert.throws(()=>pagination(invalid,20),error=>error.status===400,`expected invalid page ${String(invalid)}`);
  }
  for(const size of [0,-1,1.5,101,Infinity])assert.throws(()=>pagination('1',size),TypeError);
});

test('catalog, reports, account and every admin page issue TiDB-safe pagination SQL',async()=>{
  process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';process.env.ADMIN_DISCORD_ID='123';
  const {default:app}=await import('../api/index.js');const session=randomToken();const seen=[];
  app.locals.testQuery=async(sql,args)=>{
    if(sql.startsWith('SELECT u.id'))return [{id:42,discord_id:'123',display_name:'Admin',role_status:'active'}];
    seen.push({sql,args});
    if(sql.includes('LIMIT 100'))return [];
    const match=sql.match(/LIMIT (\d+) OFFSET (\d+)$/);assert.ok(match,sql);assert.doesNotMatch(sql,/LIMIT\s+\?|OFFSET\s+\?/i);
    const limit=Number(match[1]),offset=Number(match[2]);return Array.from({length:Math.max(0,Math.min(limit,35-offset))},(_,i)=>({id:offset+i+1}));
  };
  const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;const headers={Authorization:'Bearer '+session};
  try{
    const paths=['/api/entries?kind=game','/api/entries?kind=emulator','/api/reports?game_id=7','/api/reports?emulator_id=8','/api/account','/api/admin/reports','/api/admin/flags','/api/admin/users','/api/admin/history'];
    for(const path of paths){
      const separator=path.includes('?')?'&':'?';
      const first=await fetch(base+path+separator+'page=1',{headers});assert.equal(first.status,200,path);const data=await first.json();assert.equal(data.hasMore,true,path);
      const second=await fetch(base+path+separator+'page=2',{headers});assert.equal(second.status,200,path);const next=await second.json();assert.equal(next.hasMore,false,path);
      const firstItems=data.items||data.reports,secondItems=next.items||next.reports;assert.equal(firstItems[0].id,1,path);assert.equal(secondItems[0].id,path.includes('/entries?')?25:21,path);
      for(const invalid of ['0','-2','1.5','100001','1%3BDELETE']){const response=await fetch(base+path+separator+'page='+invalid,{headers});assert.equal(response.status,400,`${path}, ${invalid}`)}
    }
    const search="' OR 1=1 --";await fetch(base+'/api/entries?kind=game&q='+encodeURIComponent(search)+'&page=2',{headers});
    const catalog=seen.at(-1);assert.ok(!catalog.sql.includes(search));assert.deepEqual(catalog.args,['game',`%${search}%`]);assert.match(catalog.sql,/LIMIT 25 OFFSET 24$/);
    await fetch(base+'/api/reports?game_id=7&sort=constructor&page=2',{headers});const report=seen.at(-1);assert.match(report.sql,/ORDER BY r\.created_at DESC/);assert.deepEqual(report.args,['7']);
    for(const field of ['game_id','emulator_id']){await fetch(base+'/api/reports?'+field+'=7&page=1',{headers});assert.match(seen.at(-1).sql,/ORDER BY r\.created_at DESC,r\.id DESC/);await fetch(base+'/api/reports?'+field+'=7&sort=gpu&dir=asc',{headers});assert.match(seen.at(-1).sql,/ORDER BY r\.gpu ASC,r\.id DESC/);}
    assert.equal((await fetch(base+'/api/admin/unknown?page=1',{headers})).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});
