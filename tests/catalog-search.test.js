import test from 'node:test';
import assert from 'node:assert/strict';
test('catalog search uses case-insensitive parameterized matching for both kinds',async()=>{
 process.env.NODE_ENV='test';process.env.FRONTEND_URL='https://realmcmonkey.github.io/switch2-compatibility/';const {default:app}=await import('../api/index.js');const calls=[];app.locals.testQuery=async(sql,args)=>{calls.push({sql,args});return []};const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));try{const base='http://127.0.0.1:'+server.address().port;for(const kind of ['game','emulator']){const response=await fetch(base+'/api/entries?kind='+kind+'&q=mario');assert.equal(response.status,200);const query=calls.at(-1);assert.match(query.sql,/LOWER\(name\) LIKE LOWER\(\?\)/);assert.deepEqual(query.args,[kind,'%mario%']);}}finally{await new Promise(resolve=>server.close(resolve));delete app.locals.testQuery;}
});
