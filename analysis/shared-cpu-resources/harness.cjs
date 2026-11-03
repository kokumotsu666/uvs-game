const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),BASE='d757ca80709711ad9564898c39902f0fe001c411';
const DECKS=['飛鳥・連撃','柳生・射撃','斑鳩・対抗封じ','葛城・削り','雲雀・反撃'];
const CONFIGS=[];for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)CONFIGS.push([DECKS[i],DECKS[j]],[DECKS[j],DECKS[i]]);
function source(ref){const file=ref==='worktree'?path.join(ROOT,'index.html'):path.join(__dirname,ref==='refactor'?'refactor.html':ref==='candidate'?'candidate.html':ref==='pre-cache'?'pre-cache.html':'baseline.html');return fs.readFileSync(file,'utf8');}
function load(ref){
 const html=source(ref),errors=[],c=vm.createContext({console:{log(){},error(...a){errors.push(a.map(String).join(' '));}},setTimeout,clearTimeout});c.window=c;
 const run=s=>vm.runInContext(s,c);
 for(const [i,m] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()){
  run(m[1].replace(/startScreen\(\);\s*$/,''));
  if(i===0)run(`globalThis.DRAWCOUNTS=[0,0];(()=>{const original=draw;draw=function(p,n){const k=original(p,n);DRAWCOUNTS[p.idx]+=k;return k;};})();`);
 }
 return {html,c,run,errors,ref,hash:crypto.createHash('sha256').update(html).digest('hex')};
}
async function game(e,config,index,{legacy=false,record=true,seed=1000000+config*10000+index}={}){
 e.errors.length=0;
 e.run(`DRAWCOUNTS=[0,0];globalThis.ops={ops:[]};globalThis.events=[];globalThis.shortages=[0,0];globalThis.emptyHand=[0,0];globalThis.declined=[0,0];globalThis.decisions=0;
 CONFIG.deckSize=30;globalThis.ctls=[0,1].map(i=>{const base=${legacy?'AI':'Solver.makeSolver()'};return ${record?'Replay.makeRecorder(base,ops,i)':'base'};});
 setupGame({decks:${JSON.stringify(CONFIGS[config])},ctls,ai:[true,true],first:${index%2},deckSize:30,delay:0,rng:Replay.mulberry32(${seed}),hooks:{
 stat:s=>{if(s.t==='res')events.push({...s});if(s.t==='noatk'){shortages[s.p]++;if(s.hand===0)emptyHand[s.p]++;}if(s.t==='atk'&&!s.chosen&&s.options>0)declined[s.p]++;},
 turnEnd:()=>{if(G.turn>300)throw Error('turn watchdog');}}});
 for(const p of P){const inner=p.ctl,w=Object.create(inner);for(const m of ['prepAction','chooseGauge','attack','defend','heavy','chain','pickCards'])w[m]=async function(...a){if(++decisions>20000)throw Error('decision watchdog');return inner[m].apply(this,a);};p.ctl=w;}`);
 await e.run('runGame()');
 const r=JSON.parse(e.run(`JSON.stringify({over:G.over,turn:G.turn,ops:ops.ops,draw:DRAWCOUNTS,events,shortages,emptyHand,declined,decisions,final:P.map(p=>({deck:p.deck.length,hand:p.hand.length,damage:p.damage.length})),logs:G.log.map(x=>x.s)})`));
 if(!r.over||e.errors.length)throw Error(JSON.stringify({ref:e.ref,config,index,seed,errors:e.errors,over:r.over}));
 const players=r.final.map((p,i)=>{const a=r.events.filter(s=>s.p===i),d=r.events.filter(s=>s.p!==i);return {...p,draw:r.draw[i],attacks:a.length,hits:a.filter(s=>s.success&&s.dp>0).length,incoming:d.length,defensePlayed:d.filter(s=>s.def).length,defenseWins:d.filter(s=>s.def&&!s.success).length,
  heavyCards:a.reduce((n,s)=>n+s.aHeavy,0)+d.reduce((n,s)=>n+s.dHeavy,0),chainHits:a.filter(s=>s.mode&&s.success).length,
  noUsableAttack:r.shortages[i],emptyHandAttackSkip:r.emptyHand[i],declinedLegalAttack:r.declined[i],
  greenScrollUses:r.logs.filter(s=>s.startsWith('P'+(i+1)+'：サポート「緑の巻物」を使用')).length};});
 return {config,game:index,seed,first:index%2,decks:CONFIGS[config],winner:1-r.over.loser,reason:r.over.why,turn:r.turn,players,ops:r.ops,decisions:r.decisions};
}
module.exports={BASE,ROOT,DECKS,CONFIGS,source,load,game};
