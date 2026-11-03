// Node >= 24. Uses the unmodified production scripts, solver defaults and stat hook.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),SOURCE=path.join(ROOT,'index.html');
const EXPECTED_SOURCE='ffd3a0bc3f9a3447b0007bf0dc664ba841efdcdcaaff8d521a3a6ca48988d48d';
if(crypto.createHash('sha256').update(fs.readFileSync(SOURCE)).digest('hex')!==EXPECTED_SOURCE)
 throw Error('production index.html differs from pinned main; refusing to label results with the baseline commit');
const DECKS=['飛鳥・連撃','柳生・射撃','斑鳩・対抗封じ','葛城・削り','雲雀・反撃'];
const CONFIGS=[];for(let i=0;i<5;i++)for(let j=i+1;j<5;j++){CONFIGS.push([DECKS[i],DECKS[j]],[DECKS[j],DECKS[i]]);}
function engine(){
 const errors=[];const c=vm.createContext({console:{log(){},error(...args){errors.push(args.map(String).join(' '));}},setTimeout,clearTimeout});c.window=c;
 const html=fs.readFileSync(SOURCE,'utf8');
 for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(m[1].replace(/startScreen\(\);\s*$/,''),c);
 const run=s=>vm.runInContext(s,c);
 run(`if(DECK_KEYS.length!==5)throw Error('expected 5 decks');CONFIG.deckSize=30;
 for(const k of DECK_KEYS)if(DECKS[k].list30.reduce((n,x)=>n+x[1],0)!==30)throw Error('deck count');`);
 return {run,errors};
}
async function batch(task){
 const e=engine(),out=[];
 for(let game=0;game<task.count;game++){
  const seed=(task.phase==='pilot'?100000:1000000)+task.config*10000+game,first=game%2;
  const events=[];e.errors.length=0;
  e.run(`globalThis.__metrics={decisions:0};`);
  // Hook receives only real battle outcomes, never solver rollouts.
  e.run(`globalThis.__events=[];globalThis.__turns=0;
  setupGame({decks:${JSON.stringify(CONFIGS[task.config])},ctls:[Solver.makeSolver(),Solver.makeSolver()],ai:[true,true],first:${first},deckSize:30,delay:0,rng:Replay.mulberry32(${seed}),
   hooks:{stat:s=>{if(s.t==='res')__events.push({...s,damage:P.map(p=>p.damage.length),hands:P.map(p=>p.hand.length)});},
    turnEnd:()=>{if(G.turn>300)throw Error('turn watchdog');}}});
  for(const p of P){const inner=p.ctl;const w=Object.create(inner);
   for(const m of ['prepAction','chooseGauge','attack','defend','heavy','chain','pickCards'])w[m]=async function(...a){if(++__metrics.decisions>20000)throw Error('decision watchdog');return inner[m].apply(this,a);};p.ctl=w;}`);
  const start=performance.now();await e.run('runGame()');
  const raw=e.run(`({over:G.over,turn:G.turn,events:__events,decisions:__metrics.decisions,final:P.map(p=>({damage:p.damage.length,deck:p.deck.length,hand:p.hand.length})),logs:G.log.map(l=>l.s)})`);
  if(!raw.over||e.errors.length)throw Error(JSON.stringify({task,game,seed,errors:e.errors,over:raw.over}));
  const players=[0,1].map(i=>{
   const attacks=raw.events.filter(s=>s.p===i),guards=raw.events.filter(s=>s.p!==i);
   const count=needle=>raw.logs.filter(s=>s.startsWith(`P${i+1}：`)&&s.includes(needle)).length;
   return {...raw.final[i],attacks:attacks.length,hits:attacks.filter(s=>s.success).length,
    incoming:guards.length,defensePlayed:guards.filter(s=>s.def).length,defenseWins:guards.filter(s=>s.def&&!s.success).length,
    recoveryUses:count('サポート「牛乳」を使用'),heavyCards:attacks.reduce((n,s)=>n+s.aHeavy,0)+guards.reduce((n,s)=>n+s.dHeavy,0),
    chainAttempts:attacks.filter(s=>s.mode).length,chainHits:attacks.filter(s=>s.mode&&s.success).length,
    greenScrollUses:count('サポート「緑の巻物」を使用'),
    attackPasses:count('バトルを行わない'),
    enemyHeavyOnGuards:guards.filter(s=>s.def&&!s.success).reduce((n,s)=>n+s.aHeavy,0)};
  });
  const winner=1-raw.over.loser,hi=CONFIGS[task.config].indexOf('雲雀・反撃');
  let hibariPattern=null;
  if(hi>=0&&winner===hi){
   const guarded=raw.events.filter(s=>s.p!==hi&&s.def&&!s.success);
   const last=raw.events.at(-1);const damageWin=raw.over.why==='5ダメージ';
   hibariPattern={damageWin,deckoutWin:raw.over.why==='ドロー時に山札切れ',
    afterGuard:guarded.length>0,
    counterDamageWin:damageWin&&guarded.some(s=>s.turn<raw.turn)&&last?.p===hi&&last.success,
    lateCounterDamageWin:damageWin&&guarded.some(s=>s.turn<raw.turn)&&last?.p===hi&&last.success&&last.damage[hi]>=3,
    enemyHeavySpentBeforeWin:guarded.reduce((n,s)=>n+s.aHeavy,0),
    finalAttack:last?.p===hi?{mode:last.mode,at:last.at,df:last.df,ownDamageBefore:last.damage[hi],enemyHand:last.hands[1-hi]}:null};
  }
  out.push({phase:task.phase,config:task.config,game,seed,first,winner,reason:raw.over.why,turn:raw.turn,decks:CONFIGS[task.config],players,hibariPattern,decisions:raw.decisions,ms:Math.round(performance.now()-start)});
 }
 return out;
}
if(!isMainThread){batch(workerData).then(rows=>parentPort.postMessage({rows})).catch(e=>parentPort.postMessage({error:e.stack}));}
else{
 const phase=process.argv[2]||'pilot',count=+(process.argv[3]||(phase==='pilot'?100:500)),parallel=+(process.argv[4]||Math.min(4,os.availableParallelism()));
 if(!['pilot','main'].includes(phase))throw Error('phase must be pilot or main');
 if(phase==='main'){
  const pilot=JSON.parse(fs.readFileSync(path.join(__dirname,'pilot-manifest.json')));
  if(pilot.completed!==2000||pilot.errors.length)throw Error('pilot must complete 2000 games without errors');
 }
 const dest=path.join(__dirname,phase+'-games.jsonl');if(fs.existsSync(dest))throw Error('refusing to overwrite '+dest);
 fs.writeFileSync(dest,'');const started=new Date().toISOString();let next=0,active=0,done=0;const errors=[];
 const manifest=()=>fs.writeFileSync(path.join(__dirname,phase+'-manifest.json'),JSON.stringify({phase,countPerConfig:count,configurations:CONFIGS.length,completed:done,errors,started,updated:new Date().toISOString(),sourceCommit:'d757ca80709711ad9564898c39902f0fe001c411',sourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(SOURCE)).digest('hex'),node:process.version,parallel,seedFormula:'(pilot ? 100000 : 1000000) + config * 10000 + game',firstFormula:'game % 2 (0=P1,1=P2)',solver:{samples:24,iters:120,temperature:1},configs:CONFIGS},null,2)+'\n');
 function launch(){
  while(active<parallel&&next<CONFIGS.length&&!errors.length){const config=next++;active++;
   const w=new Worker(__filename,{workerData:{phase,count,config}});
   const timeout=setTimeout(()=>{errors.push({config,error:'worker timeout (10min)'});w.terminate();},600000);
   w.once('message',m=>{clearTimeout(timeout);if(m.error)errors.push({config,error:m.error});else{fs.appendFileSync(dest,m.rows.map(r=>JSON.stringify(r)).join('\n')+'\n');done+=m.rows.length;console.log(`${phase}: ${done}/${20*count} completed (config ${config})`);}manifest();});
   w.once('error',err=>{clearTimeout(timeout);errors.push({config,error:err.stack});manifest();});
   w.once('exit',code=>{clearTimeout(timeout);active--;if(code&&!errors.length)errors.push({config,error:'worker exit '+code});manifest();launch();});
  }
  if(!active&&(next===20||errors.length)){manifest();console.log(JSON.stringify({phase,completed:done,errors}));if(errors.length)process.exitCode=1;}
 }
 manifest();launch();
}
