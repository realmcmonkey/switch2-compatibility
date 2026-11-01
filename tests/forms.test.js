import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const bundled=build({entryPoints:['src/main.jsx'],bundle:true,write:false,platform:'browser',format:'iife',loader:{'.css':'empty'},define:{'import.meta.env.VITE_API_URL':'"https://api.example.test"','process.env.NODE_ENV':'"production"'}}).then(result=>result.outputFiles[0].text);
const wait=async(predicate)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Timed out waiting for the interface');};

async function openForm(route,{fail=false}={}){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.test/#'+route,runScripts:'outside-only'});const {window}=dom;const calls=[];
  window.localStorage.setItem('s2cl_session','test-session');
  window.fetch=async(url,options={})=>{
    const path=new URL(url).pathname;const method=options.method||'GET';calls.push({path,method,options});
    let data={};let ok=true;
    if(path==='/api/me')data={user:{id:1,display_name:'Tester',is_admin:true}};
    else if(method==='POST'||method==='PUT'){if(fail){data={error:'Submission rejected by server'};ok=false}else data={id:55};}
    else if(path==='/api/entries/5')data={id:5,kind:route.includes('emulator')?'emulator':'game',name:'Existing entry',owner_id:1};
    else if(path==='/api/entries')data={items:[],hasMore:false};
    else if(path==='/api/reports/5')data={id:5,game_id:2,emulator_id:3,revision:'v1',os:'OS',cpu:'CPU',gpu:'GPU',result:'Playable',tested_at:'2026-01-01'};
    else if(path==='/api/account')data={reports:[],entries:[],hasMore:false};
    else if(path==='/api/admin/reports')data={items:[{id:9,game_name:'Game',emulator_name:'Emulator',status:'pending',result:'Playable',tested_at:'2026-01-01'}],hasMore:false};
    return {ok,json:async()=>data};
  };
  window.eval(await bundled);await wait(()=>window.document.querySelector('form'));if(route.startsWith('/edit/')||route.startsWith('/report/edit/'))await wait(()=>calls.some(c=>c.path.endsWith('/5')));
  return {window,calls,close:()=>window.close()};
}

test('game, emulator, and report forms send authenticated create and edit requests',async()=>{
  const cases=[['/submit/game','/api/entries','POST','/games/55'],['/submit/emulator','/api/entries','POST','/emulators/55'],['/edit/game/5','/api/entries/5','PUT','/games/5'],['/edit/emulator/5','/api/entries/5','PUT','/emulators/5'],['/report/2','/api/reports','POST','/account'],['/report/edit/5','/api/reports/5','PUT','/account']];
  for(const [route,path,method,destination] of cases){const ui=await openForm(route);try{ui.window.document.querySelector('form').dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>ui.calls.some(c=>c.path===path&&c.method===method));const request=ui.calls.find(c=>c.path===path&&c.method===method);assert.equal(request.options.headers.Authorization,'Bearer test-session',route);assert.equal(request.options.headers['Content-Type'],'application/json',route);assert.equal(typeof JSON.parse(request.options.body),'object',route);await wait(()=>ui.window.location.hash==='#'+destination);}finally{ui.close();}}
});

test('entry and report submission errors are visible and keep the user on the form',async()=>{
  for(const route of ['/submit/game','/submit/emulator','/edit/game/5','/report/2','/report/edit/5']){const ui=await openForm(route,{fail:true});try{ui.window.document.querySelector('form').dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>ui.window.document.querySelector('[role="alert"]'));assert.match(ui.window.document.querySelector('[role="alert"]').textContent,/Submission rejected by server/);assert.equal(ui.window.location.hash,'#'+route);}finally{ui.close();}}
});

test('report pagination controls cannot submit the report form',async()=>{const ui=await openForm('/report/2');try{for(const button of ui.window.document.querySelectorAll('.pagination button'))assert.equal(button.type,'button');}finally{ui.close();}});

test('moderation and logout actions use the authenticated request helper',async()=>{
  const admin=await openForm('/submit/game');try{
    admin.window.confirm=()=>true;admin.window.location.hash='#/admin';await wait(()=>[...admin.window.document.querySelectorAll('button')].some(button=>button.textContent==='Approve'));
    [...admin.window.document.querySelectorAll('button')].find(button=>button.textContent==='Approve').click();await wait(()=>admin.calls.some(c=>c.path==='/api/admin/report/9/approve'&&c.method==='POST'));
    assert.equal(admin.calls.find(c=>c.path==='/api/admin/report/9/approve').options.headers.Authorization,'Bearer test-session');
    admin.window.location.hash='#/account';await wait(()=>[...admin.window.document.querySelectorAll('button')].some(button=>button.textContent==='Sign out'));
    [...admin.window.document.querySelectorAll('button')].find(button=>button.textContent==='Sign out').click();await wait(()=>admin.calls.some(c=>c.path==='/api/auth/logout'&&c.method==='POST'));
    assert.equal(admin.calls.find(c=>c.path==='/api/auth/logout').options.headers.Authorization,'Bearer test-session');
  }finally{admin.close();}
});
