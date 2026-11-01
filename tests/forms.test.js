import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const bundled=build({entryPoints:['src/main.jsx'],bundle:true,write:false,platform:'browser',format:'iife',loader:{'.css':'empty'},define:{'import.meta.env.VITE_API_URL':'"https://api.example.test"','process.env.NODE_ENV':'"production"'}}).then(result=>result.outputFiles[0].text);
const wait=async(predicate)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Timed out waiting for the interface');};

async function openForm(route,{fail=false,githubUnavailable=false,githubApiUnavailable=false,duplicateCheckFailure=false,fixtureGithub='',gameFixtures=false,failReportOnce=false,existingRepo=null,duplicateOnSave=false}={}){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.test/#'+route,runScripts:'outside-only'});const {window}=dom;const calls=[];
  window.localStorage.setItem('s2cl_session','test-session');
  window.fetch=async(url,options={})=>{
    const parsed=new URL(url);const path=parsed.pathname;const method=options.method||'GET';calls.push({path,method,options,url:String(url)});
    let data={};let ok=true;
    if(parsed.hostname==='api.github.com'){if(githubUnavailable||githubApiUnavailable){ok=false;data={}}else if(path.endsWith('/readme'))data='# ExampleEmu\n\nExampleEmu is an emulator for compatible systems.';else if(path.endsWith('/releases/latest'))data={tag_name:'v2.0'};else data={name:'ExampleEmu',description:'An emulator',owner:{avatar_url:'https://avatars.githubusercontent.com/u/42'}};}
    else if(parsed.hostname==='raw.githubusercontent.com'){if(githubUnavailable){ok=false;data={}}else data='# README Emulator\n\nREADME Emulator runs games on compatible computers.';}
    else if(path==='/api/me')data={user:{id:1,display_name:'Tester',is_admin:true}};
    else if(method==='POST'||method==='PUT'){if(duplicateOnSave&&path==='/api/entries'){data={error:'This repository is already listed.',existing:duplicateOnSave};ok=false}else if(fail||(path==='/api/reports'&&failReportOnce)){data={error:'Submission rejected by server'};ok=false;failReportOnce=false}else data={id:55};}
    else if(path==='/api/entries/5')data={id:5,kind:route.includes('emulator')?'emulator':'game',name:'Existing entry',owner_id:1,wikipedia_url:'https://en.wikipedia.org/wiki/Existing',...(fixtureGithub?{github_url:fixtureGithub}:{}),...(gameFixtures?{recommended_games:[{id:2,name:'Game Two'}]}:{})};
    else if(path==='/api/entries')data={items:gameFixtures&&parsed.searchParams.get('kind')==='game'?[{id:2,name:'Game Two'}]:[],hasMore:false};
    else if(path==='/api/reports/5')data={id:5,game_id:2,emulator_id:3,revision:'v1',os:'OS',cpu:'CPU',gpu:'GPU',result:'Playable',tested_at:'2026-01-01'};
    else if(path==='/api/account')data={reports:[],entries:[],hasMore:false};
    else if(path==='/api/admin/reports')data={items:[{id:9,game_name:'Game',emulator_name:'Emulator',status:'pending',result:'Playable',tested_at:'2026-01-01'}],hasMore:false};
    else if(path==='/api/emulators/repository'){if(duplicateCheckFailure){ok=false;data={error:'Duplicate check unavailable'}}else data={existing:existingRepo};}
    else if(path==='/api/reports')data={items:[{id:9,user_id:12,tester:'Tester',game_id:2,game_name:'Game Two',emulator_id:5,emulator_name:'Emulator',revision:'1',os:'OS',cpu:'CPU',gpu:'GPU',result:'Playable',tested_at:'2026-01-01'}],hasMore:false};
    else if(path==='/api/users/12')data={user:{id:12,display_name:'Tester'},items:[{id:9,game_id:2,game_name:'Game Two',emulator_id:5,emulator_name:'Emulator',revision:'1',os:'OS',cpu:'CPU',gpu:'GPU',result:'Playable',tested_at:'2026-01-01'}],hasMore:false};
    return {ok,status:ok?200:403,json:async()=>data,text:async()=>typeof data==='string'?data:JSON.stringify(data)};
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

test('report form has no pagination controls and emulator search remains available',async()=>{const ui=await openForm('/report/2');try{assert.equal(ui.window.document.querySelector('.pagination'),null);const input=[...ui.window.document.querySelectorAll('input')].find(x=>x.parentElement.textContent.includes('Search emulators'));Object.getOwnPropertyDescriptor(ui.window.HTMLInputElement.prototype,'value').set.call(input,'search-term');input.dispatchEvent(new ui.window.Event('input',{bubbles:true}));await wait(()=>ui.calls.some(c=>c.path==='/api/entries'&&c.options.method===undefined&&c.options&&c.url?.includes('q=search-term')));}finally{ui.close();}});

test('emulator dropdown includes the not-listed option and switches the button',async()=>{
  const ui=await openForm('/report/2');try{const {window}=ui;const select=window.document.querySelector('[name="emulator_id"]');assert.ok([...select.options].some(option=>option.value==='__not_listed__'&&option.textContent==='Emulator not listed'));assert.equal(window.document.querySelector('input[type="checkbox"]'),null);select.value='__not_listed__';select.dispatchEvent(new window.Event('change',{bubbles:true}));await wait(()=>window.document.querySelector('form > button.btn.yellow').textContent==='Next');select.value='';select.dispatchEvent(new window.Event('change',{bubbles:true}));await wait(()=>window.document.querySelector('form > button.btn.yellow').textContent==='Submit for review');}finally{ui.close();}
});

test('missing emulator flow adds an emulator and submits the retained report for review',async()=>{
  const ui=await openForm('/report/2');try{const {window}=ui;const revision=window.document.querySelector('[name="revision"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(revision,'build-123');revision.dispatchEvent(new window.Event('input',{bubbles:true}));window.document.querySelector('[name="emulator_id"]').value='__not_listed__';window.document.querySelector('[name="emulator_id"]').dispatchEvent(new window.Event('change',{bubbles:true}));await wait(()=>window.document.querySelector('button[type="submit"],form > button.btn.yellow')?.textContent==='Next');window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>window.document.querySelector('[name="github_url"]'));assert.equal(ui.calls.filter(c=>c.method==='POST').length,0);const name=window.document.querySelector('[name="name"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(name,'New Emulator');name.dispatchEvent(new window.Event('input',{bubbles:true}));await wait(()=>name.value==='New Emulator');window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>ui.calls.some(c=>c.path==='/api/reports'&&c.method==='POST'));const entry=JSON.parse(ui.calls.find(c=>c.path==='/api/entries'&&c.method==='POST').options.body);const report=JSON.parse(ui.calls.find(c=>c.path==='/api/reports'&&c.method==='POST').options.body);assert.equal(entry.name,'New Emulator');assert.equal(report.emulator_id,55);assert.equal(report.game_id,'2');assert.equal(report.revision,'build-123');await wait(()=>window.location.hash==='#/account');}finally{ui.close();}
});

test('failed report submission retries without adding a duplicate emulator',async()=>{
  const ui=await openForm('/report/2',{failReportOnce:true});try{const {window}=ui;window.document.querySelector('[name="emulator_id"]').value='__not_listed__';window.document.querySelector('[name="emulator_id"]').dispatchEvent(new window.Event('change',{bubbles:true}));await wait(()=>window.document.body.textContent.includes('Next'));window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>window.document.querySelector('[name="github_url"]'));const name=window.document.querySelector('[name="name"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(name,'New Emulator');name.dispatchEvent(new window.Event('input',{bubbles:true}));await wait(()=>name.value==='New Emulator');window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>window.document.querySelector('[role="alert"]')?.textContent.includes('Emulator added'));assert.equal(ui.calls.filter(c=>c.path==='/api/entries'&&c.method==='POST').length,1);assert.ok(window.document.body.textContent.includes('Retry report submission'));window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>window.location.hash==='#/account');assert.equal(ui.calls.filter(c=>c.path==='/api/entries'&&c.method==='POST').length,1);assert.equal(ui.calls.filter(c=>c.path==='/api/reports'&&c.method==='POST').length,2);}finally{ui.close();}
});

test('failed emulator creation leaves the report unsubmitted and allows going back',async()=>{
  const ui=await openForm('/report/2',{fail:true});try{const {window}=ui;window.document.querySelector('[name="emulator_id"]').value='__not_listed__';window.document.querySelector('[name="emulator_id"]').dispatchEvent(new window.Event('change',{bubbles:true}));await wait(()=>window.document.body.textContent.includes('Next'));window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>window.document.querySelector('[name="github_url"]'));const name=window.document.querySelector('[name="name"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(name,'New Emulator');name.dispatchEvent(new window.Event('input',{bubbles:true}));window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>window.document.querySelector('[role="alert"]'));assert.match(window.document.querySelector('[role="alert"]').textContent,/Submission rejected by server/);assert.equal(ui.calls.filter(c=>c.path==='/api/reports'&&c.method==='POST').length,0);[...window.document.querySelectorAll('button')].find(b=>b.textContent==='Back to report').click();await wait(()=>window.document.querySelector('[name="revision"]'));assert.equal(window.document.querySelector('[name="emulator_id"]').value,'__not_listed__');}finally{ui.close();}
});

test('duplicate repository confirmation opens the existing emulator from its add page',async()=>{
  const ui=await openForm('/submit/emulator',{existingRepo:{id:77,name:'Existing Emulator'}});try{const {window}=ui;let prompts=0;window.confirm=message=>{prompts++;assert.match(message,/Existing Emulator/);return true};const input=window.document.querySelector('[name="github_url"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'https://github.com/owner/repo');input.dispatchEvent(new window.Event('input',{bubbles:true}));await wait(()=>window.location.hash==='#/emulators/77');assert.equal(prompts,1);assert.equal(ui.calls.filter(c=>c.method==='POST').length,0);}finally{ui.close();}
});

test('duplicate repository in a report returns to the completed report with that emulator selected',async()=>{
  const ui=await openForm('/report/2',{existingRepo:{id:77,name:'Existing Emulator'}});try{const {window}=ui;window.confirm=()=>true;const revision=window.document.querySelector('[name="revision"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(revision,'saved-revision');revision.dispatchEvent(new window.Event('input',{bubbles:true}));const select=window.document.querySelector('[name="emulator_id"]');select.value='__not_listed__';select.dispatchEvent(new window.Event('change',{bubbles:true}));await wait(()=>window.document.querySelector('form > button.btn.yellow').textContent==='Next');window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>window.document.querySelector('[name="github_url"]'));const input=window.document.querySelector('[name="github_url"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'https://github.com/owner/repo');input.dispatchEvent(new window.Event('input',{bubbles:true}));await wait(()=>window.document.querySelector('[name="emulator_id"]')?.value==='77');assert.equal(window.document.querySelector('[name="revision"]').value,'saved-revision');assert.equal(window.document.querySelector('[name="emulator_id"]').selectedOptions[0].textContent,'Existing Emulator');assert.equal(window.document.querySelector('form > button.btn.yellow').textContent,'Submit for review');assert.equal(ui.calls.filter(c=>c.method==='POST').length,0);}finally{ui.close();}
});

test('duplicate save warning waits for confirmation before navigating',async()=>{
  const existing={id:77,name:'Existing Emulator'};const ui=await openForm('/submit/emulator',{duplicateOnSave:existing});try{const {window}=ui;window.confirm=()=>false;window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>window.document.querySelector('[role="alert"]'));assert.equal(window.location.hash,'#/submit/emulator');assert.match(window.document.querySelector('[role="alert"]').textContent,/already listed/);window.confirm=()=>true;window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>window.location.hash==='#/emulators/77');}finally{ui.close();}
});

test('emulator GitHub lookup fills editable fields; game form retains Wikipedia',async()=>{
  const ui=await openForm('/submit/emulator');try{
    const {window}=ui;const input=window.document.querySelector('[name="github_url"]');assert.ok(input);assert.equal(window.document.querySelector('[name="wikipedia_url"]'),null);
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'https://github.com/owner/ExampleEmu');input.dispatchEvent(new window.Event('input',{bubbles:true}));
    await wait(()=>window.document.querySelector('[name="versions"]').value==='v2.0');
    assert.equal(window.document.querySelector('[name="name"]').value,'ExampleEmu');assert.equal(window.document.querySelector('[name="description"]').value,'An emulator');assert.equal(window.document.querySelector('[name="image_url"]').value,'https://avatars.githubusercontent.com/u/42');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(window.document.querySelector('[name="name"]'),'Edited name');window.document.querySelector('[name="name"]').dispatchEvent(new window.Event('input',{bubbles:true}));
    window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>ui.calls.some(c=>c.path==='/api/entries'&&c.method==='POST'));
    const body=JSON.parse(ui.calls.find(c=>c.path==='/api/entries'&&c.method==='POST').options.body);assert.equal(body.name,'Edited name');assert.equal(body.github_url,'https://github.com/owner/ExampleEmu');
  }finally{ui.close();}
  const game=await openForm('/submit/game');try{assert.ok(game.window.document.querySelector('[name="wikipedia_url"]'));assert.equal(game.window.document.querySelector('[name="github_url"]'),null);}finally{game.close();}
});

test('failed GitHub lookup allows manual entry and legacy emulator Wikipedia is preserved',async()=>{
  const ui=await openForm('/edit/emulator/5',{githubUnavailable:true});try{const {window}=ui;await wait(()=>window.document.querySelector('[name="name"]').value==='Existing entry');const input=window.document.querySelector('[name="github_url"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'https://github.com/owner/repo');input.dispatchEvent(new window.Event('input',{bubbles:true}));await wait(()=>window.document.body.textContent.includes('metadata and README are unavailable'));window.document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>ui.calls.some(c=>c.path==='/api/entries/5'&&c.method==='PUT'));const body=JSON.parse(ui.calls.find(c=>c.method==='PUT').options.body);assert.equal(body.wikipedia_url,'https://en.wikipedia.org/wiki/Existing');assert.equal(body.name,'Existing entry');}finally{ui.close();}
});

test('emulator form suggests README details when the GitHub API is unavailable',async()=>{
  const ui=await openForm('/submit/emulator',{githubApiUnavailable:true});try{const {window}=ui;const input=window.document.querySelector('[name="github_url"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'https://github.com/owner/repo');input.dispatchEvent(new window.Event('input',{bubbles:true}));await wait(()=>window.document.querySelector('[name="name"]').value==='README Emulator');assert.equal(window.document.querySelector('[name="description"]').value,'README Emulator runs games on compatible computers.');assert.match(window.document.body.textContent,/suggestions were read from the repository README/);}finally{ui.close();}
});

test('a duplicate-check outage does not stop GitHub metadata lookup',async()=>{
  const ui=await openForm('/submit/emulator',{duplicateCheckFailure:true});try{const {window}=ui;const input=window.document.querySelector('[name="github_url"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'https://github.com/owner/repo');input.dispatchEvent(new window.Event('input',{bubbles:true}));await wait(()=>window.document.querySelector('[name="name"]').value==='ExampleEmu');assert.match(window.document.body.textContent,/Could not check for duplicate repositories/);}finally{ui.close();}
});

test('published emulator detail links to its GitHub repository',async()=>{
  const ui=await openForm('/submit/emulator',{fixtureGithub:'https://github.com/owner/repo'});try{ui.window.location.hash='#/emulators/5';await wait(()=>[...ui.window.document.querySelectorAll('a')].some(a=>a.textContent.includes('GitHub repository')));const link=[...ui.window.document.querySelectorAll('a')].find(a=>a.textContent.includes('GitHub repository'));assert.equal(link.href,'https://github.com/owner/repo');}finally{ui.close();}
});

test('emulator recommendations can be selected and submitted as catalog game IDs',async()=>{
  const ui=await openForm('/submit/emulator',{gameFixtures:true});try{await wait(()=>[...ui.window.document.querySelectorAll('button')].some(b=>b.textContent.includes('Game Two')));[...ui.window.document.querySelectorAll('button')].find(b=>b.textContent.includes('Game Two')).click();await wait(()=>[...ui.window.document.querySelectorAll('button')].some(b=>b.textContent==='Remove'));ui.window.document.querySelector('form').dispatchEvent(new ui.window.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>ui.calls.some(c=>c.path==='/api/entries'&&c.method==='POST'));const body=JSON.parse(ui.calls.find(c=>c.path==='/api/entries'&&c.method==='POST').options.body);assert.deepEqual(body.recommended_game_ids,[2]);}finally{ui.close();}
});

test('emulator report links lead to public tester profiles and normal game pages',async()=>{
  const ui=await openForm('/submit/emulator',{gameFixtures:true});try{ui.window.location.hash='#/emulators/5';await wait(()=>[...ui.window.document.querySelectorAll('a')].some(a=>a.hash==='#/users/12'));const tester=[...ui.window.document.querySelectorAll('a')].find(a=>a.hash==='#/users/12');assert.equal(tester.hash,'#/users/12');assert.ok([...ui.window.document.querySelectorAll('a')].some(a=>a.textContent.includes('Game Two')&&a.hash==='#/games/2'));tester.click();await wait(()=>ui.window.document.body.textContent.includes('Approved compatibility reports from this community member.'));assert.ok([...ui.window.document.querySelectorAll('a')].some(a=>a.textContent==='Emulator'&&a.hash==='#/emulators/5'));assert.ok([...ui.window.document.querySelectorAll('a')].some(a=>a.textContent==='Game Two'&&a.hash==='#/games/2'));}finally{ui.close();}
});

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
