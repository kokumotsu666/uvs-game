const fs=require('node:fs'),path=require('node:path');const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {engine,play,SOURCE_COMMIT,HASH,CONFIGS}=require('./runtime.cjs');
async function batch(t){const e=engine(),rows=[];for(let game=0;game<t.count;game++)rows.push(await play(e,{config:t.config,size:t.size,game}));return rows;}
if(!isMainThread)batch(workerData).then(rows=>parentPort.postMessage({rows})).catch(e=>parentPort.postMessage({error:e.stack}));
else{
 const phase=process.argv[2]||'main',count=phase==='pilot'?10:500,parallel=4;
 if(!['pilot','main'].includes(phase))throw Error('pilot or main');
 if(phase==='main'){const p=JSON.parse(fs.readFileSync(path.join(__dirname,'pilot-manifest.json')));if(p.completed!==120||p.errors.length)throw Error('pilot must pass');}
 const tasks=[];for(const size of [30,35,40])for(let config=0;config<4;config++)tasks.push({size,config,count});
 const dest=path.join(__dirname,phase+'-games.jsonl');if(fs.existsSync(dest))throw Error('refuse overwrite');fs.writeFileSync(dest,'');
 const started=new Date().toISOString();let next=0,active=0,completed=0;const errors=[];
 const manifest=()=>fs.writeFileSync(path.join(__dirname,phase+'-manifest.json'),JSON.stringify({phase,completed,errors,started,updated:new Date().toISOString(),countPerSeat:count,parallel,sourceCommit:SOURCE_COMMIT,sourceSHA256:HASH,
  configs:CONFIGS,sizes:[30,35,40],first:'game % 2 (0=P1,1=P2)',seed:'1000000 + [10,11,18,19][config] * 10000 + game',matchedSeedsAcrossSizes:true,solver:{samples:24,iters:120},pilotUsesFirst10MainSeeds:true},null,2)+'\n');
 function launch(){while(active<parallel&&next<tasks.length&&!errors.length){const task=tasks[next++];active++;
  const w=new Worker(__filename,{workerData:task}),timer=setTimeout(()=>{errors.push({task,error:'10 minute timeout'});w.terminate();},600000);
  w.once('message',m=>{clearTimeout(timer);if(m.error)errors.push({task,error:m.error});else{fs.appendFileSync(dest,m.rows.map(g=>JSON.stringify(g)).join('\n')+'\n');completed+=m.rows.length;console.log(phase+' '+completed+'/'+(12*count)+' size='+task.size+' config='+task.config);}manifest();});
  w.once('error',e=>{clearTimeout(timer);errors.push({task,error:e.stack});manifest();});
  w.once('exit',code=>{clearTimeout(timer);active--;if(code&&!errors.length)errors.push({task,error:'exit '+code});manifest();launch();});
 }if(!active&&(next===tasks.length||errors.length)){manifest();console.log(JSON.stringify({phase,completed,errors}));if(errors.length)process.exitCode=1;}}
 manifest();launch();
}
