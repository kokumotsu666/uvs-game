const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {meteredEngine,measure}=require('./meter.cjs');
async function batch(t){const e=meteredEngine(),rows=[],events=[];
 for(let game=0;game<t.count;game++){const r=await measure(e,{size:t.size,config:t.config,game});rows.push(r.game);events.push(...r.events.map(x=>({size:t.size,config:t.config,game,seed:r.game.seed,first:r.game.first,...x})));}
 return {rows,events};}
if(!isMainThread)batch(workerData).then(data=>parentPort.postMessage(data)).catch(e=>parentPort.postMessage({error:e.stack}));
else{
 const phase=process.argv[2]||'main',count=phase==='pilot'?10:500;
 if(!['pilot','main'].includes(phase))throw Error('pilot or main');
 if(phase==='main'){const p=JSON.parse(fs.readFileSync(path.join(__dirname,'pilot-manifest.json')));if(p.completed!==120||p.errors.length||p.unclassified)throw Error('pilot must pass without unknown draws');}
 const tasks=[];for(const size of [30,35,40])for(let config=0;config<4;config++)tasks.push({size,config,count});
 const dest=path.join(__dirname,phase+'-games.jsonl'),draws=path.join(__dirname,phase+'-draws.jsonl.gz');
 if(fs.existsSync(dest)||fs.existsSync(draws))throw Error('refuse overwrite');fs.writeFileSync(dest,'');fs.writeFileSync(draws,'');
 let next=0,active=0,completed=0,drawCalls=0,unclassified=0;const errors=[],started=new Date().toISOString();
 const manifest=()=>fs.writeFileSync(path.join(__dirname,phase+'-manifest.json'),JSON.stringify({phase,completed,drawCalls,unclassified,errors,started,updated:new Date().toISOString(),sourceCommit:'d757ca80709711ad9564898c39902f0fe001c411',PR3Head:'fcbdf073e874501bef8594c23be21e5a74d4edc9',seedAndSeats:'identical to PR3',countPerSeat:count,parallel:4,referenceMatches:completed},null,2)+'\n');
 function launch(){while(active<4&&next<tasks.length&&!errors.length){const task=tasks[next++];active++;
  const w=new Worker(__filename,{workerData:task});const timer=setTimeout(()=>{errors.push({task,error:'10 minute timeout'});w.terminate();},600000);
  w.once('message',r=>{clearTimeout(timer);if(r.error)errors.push({task,error:r.error});else{
   fs.appendFileSync(dest,r.rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
   fs.appendFileSync(draws,zlib.gzipSync(r.events.map(x=>JSON.stringify(x)).join('\n')+'\n'));
   completed+=r.rows.length;drawCalls+=r.events.length;unclassified+=r.rows.reduce((n,g)=>n+g.unclassified,0);
   console.log(phase+' '+completed+'/'+12*count+' size='+task.size+' config='+task.config+' unknown='+unclassified);
  }manifest();});
  w.once('error',e=>{clearTimeout(timer);errors.push({task,error:e.stack});manifest();});
  w.once('exit',code=>{clearTimeout(timer);active--;if(code&&!errors.length)errors.push({task,error:'exit '+code});manifest();launch();});
 }if(!active&&(next===tasks.length||errors.length)){manifest();console.log(JSON.stringify({phase,completed,drawCalls,unclassified,errors}));if(errors.length||unclassified)process.exitCode=1;}}
 manifest();launch();
}
