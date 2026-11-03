const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');const {load,game,BASE}=require('./harness.cjs');
async function batch({config,count}){
 const a=load(BASE),b=load('refactor'),rows=[],operations=[];
 assert.equal(a.html.match(/<style>[\s\S]*?<\/style>/)[0],b.html.match(/<style>[\s\S]*?<\/style>/)[0]);
 const invariant=`JSON.stringify({CONFIG,CARDS,CHARS,DECKS},(k,v)=>typeof v==='function'?v.toString():v)`;
 assert.equal(a.run(invariant),b.run(invariant));
 for(let index=0;index<count;index++){
  const x=await game(a,config,index),y=await game(b,config,index);assert.deepEqual(y,x,'all operations and final state must match');
  const {ops,...summary}=x;rows.push({...summary,operationsEqual:true,operationCount:ops.length,operationSHA256:crypto.createHash('sha256').update(JSON.stringify(ops)).digest('hex')});operations.push({config,game:index,seed:x.seed,first:x.first,ops});
 }
 // The old controller remains supported; smoke-check both seats per configuration.
 for(let i=0;i<2;i++)assert.deepEqual(await game(a,config,i,{legacy:true}),await game(b,config,i,{legacy:true}));
 return {rows,operations};
}
if(!isMainThread)batch(workerData).then(r=>parentPort.postMessage(r)).catch(e=>parentPort.postMessage({error:e.stack}));
else{
 const dir=__dirname,results=path.join(dir,'refactor-games.jsonl'),opsFile=path.join(dir,'refactor-operations.jsonl.gz');
 if(fs.existsSync(results))throw Error('refuse overwrite');fs.writeFileSync(results,'');fs.writeFileSync(opsFile,'');
 let next=0,active=0,completed=0;const errors=[];const start=new Date().toISOString();
 const manifest=()=>fs.writeFileSync(path.join(dir,'refactor-validation.json'),JSON.stringify({completed,errors,baseline:BASE,candidateHash:load('refactor').hash,started:start,updated:new Date().toISOString(),target:2000,legacySmokeGames:completed/100*2},null,2)+'\n');
 function launch(){while(active<4&&next<20&&!errors.length){const config=next++;active++;const w=new Worker(__filename,{workerData:{config,count:100}}),timer=setTimeout(()=>{errors.push({config,error:'timeout'});w.terminate();},600000);
  w.on('message',r=>{clearTimeout(timer);if(r.error)errors.push({config,error:r.error});else{fs.appendFileSync(results,r.rows.map(x=>JSON.stringify(x)).join('\n')+'\n');fs.appendFileSync(opsFile,zlib.gzipSync(r.operations.map(x=>JSON.stringify(x)).join('\n')+'\n'));completed+=r.rows.length;console.log('refactor '+completed+'/2000');}manifest();});
  w.on('error',e=>{clearTimeout(timer);errors.push({config,error:e.stack});manifest();});w.on('exit',()=>{clearTimeout(timer);active--;launch();});
 }if(!active&&(next===20||errors.length)){manifest();console.log(JSON.stringify({completed,errors}));if(errors.length)process.exitCode=1;}}launch();
}
