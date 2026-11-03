const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');const {load,game,BASE,CONFIGS}=require('./harness.cjs');
async function batch({condition,config,count}){const e=load(condition==='A'?BASE:'candidate'),rows=[];for(let i=0;i<count;i++){
 const {ops,...r}=await game(e,config,i);rows.push({...r,condition,operationCount:ops.length,operationSHA256:crypto.createHash('sha256').update(JSON.stringify(ops)).digest('hex')});}return rows;}
if(!isMainThread)batch(workerData).then(rows=>parentPort.postMessage({rows})).catch(e=>parentPort.postMessage({error:e.stack}));
else{
 const condition=process.argv[2]||'A',count=condition==='pilot'?10:500;if(!['A','B','pilot'].includes(condition))throw Error('A/B/pilot');
 if(condition==='B'){const p=JSON.parse(fs.readFileSync(path.join(__dirname,'pilot-manifest.json')));if(p.completed!==200||p.errors.length)throw Error('pilot required');}
 const dest=path.join(__dirname,condition+'-games.jsonl');if(fs.existsSync(dest))throw Error('refuse overwrite');fs.writeFileSync(dest,'');
 let next=0,active=0,completed=0;const errors=[],started=new Date().toISOString(),e=load(condition==='A'?BASE:'candidate');
 const manifest=()=>fs.writeFileSync(path.join(__dirname,condition+'-manifest.json'),JSON.stringify({condition,completed,errors,started,updated:new Date().toISOString(),sourceHash:e.hash,baseline:BASE,countPerConfig:count,configs:CONFIGS,seed:'1000000 + config*10000 + game',first:'game%2',solver:{samples:24,iters:120},drawMetric:'actual cards, including opening 4'},null,2)+'\n');
 function launch(){while(active<4&&next<20&&!errors.length){const config=next++;active++;const w=new Worker(__filename,{workerData:{condition,config,count}});const timer=setTimeout(()=>{errors.push({config,error:'15 minute timeout'});w.terminate();},900000);
  w.once('message',m=>{clearTimeout(timer);if(m.error)errors.push({config,error:m.error});else{fs.appendFileSync(dest,m.rows.map(r=>JSON.stringify(r)).join('\n')+'\n');completed+=m.rows.length;console.log(condition+' '+completed+'/'+20*count);}manifest();});
  w.once('error',err=>{clearTimeout(timer);errors.push({config,error:err.stack});manifest();});w.once('exit',code=>{clearTimeout(timer);active--;if(code&&!errors.length)errors.push({config,error:'exit '+code});manifest();launch();});
 }if(!active&&(next===20||errors.length)){manifest();console.log(JSON.stringify({condition,completed,errors}));if(errors.length)process.exitCode=1;}}manifest();launch();
}
