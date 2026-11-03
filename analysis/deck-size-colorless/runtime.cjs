const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const SOURCE=path.resolve(__dirname,'../../index.html');
const SOURCE_COMMIT='d757ca80709711ad9564898c39902f0fe001c411';
const HASH='ffd3a0bc3f9a3447b0007bf0dc664ba841efdcdcaaff8d521a3a6ca48988d48d';
const CONFIGS=[['柳生・射撃','葛城・削り'],['葛城・削り','柳生・射撃'],['葛城・削り','雲雀・反撃'],['雲雀・反撃','葛城・削り']];
const OLD_CONFIG=[10,11,18,19];
function engine(experimental=true){
 const html=fs.readFileSync(SOURCE,'utf8');if(crypto.createHash('sha256').update(html).digest('hex')!==HASH)throw Error('baseline source changed');
 const errors=[];const c=vm.createContext({console:{log(){},error(...a){errors.push(a.map(String).join(' '))}},setTimeout,clearTimeout});c.window=c;
 const run=s=>vm.runInContext(s,c);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 scripts.forEach((s,i)=>{
  run(s.replace(/startScreen\(\);\s*$/,''));
  // Install before extra-card closures capture draw/mill. Production file is untouched.
  if(i===0&&experimental)run(`
    globalThis.EXP={players:[],calls:[]};
    globalThis.resetExperiment=()=>{EXP={players:[0,1].map(()=>({destroyNeutral:0,destroyNormal:0,drawNeutral:0,costNeutral:0,costNormal:0})),calls:[]};};
    resetExperiment();
    globalThis.makeNeutral=()=>inst({type:'colorless',experimentalNeutral:true,name:'実験用・無色',color:'無',gp:{yo:0,in:0},at:0,df:0,dp:0,tech:'なし',icons:[]});
    const originalDraw=draw,originalMill=mill;
    draw=function(p,n){const before=p.hand.length;const k=originalDraw(p,n);if(EXP.players[p.idx])EXP.players[p.idx].drawNeutral+=p.hand.slice(before).filter(c=>c.experimentalNeutral).length;return k;};
    mill=function(p,n,why){
      const cost=why==='リミットブレイク';
      const known=['効果','ドラゴンベアード','葛城Lv4','葛城Lv5','雲雀Lv5'];
      if(!cost&&!known.includes(why))throw Error('unclassified mill source: '+why);
      const before=p.deck.length,removed=[];
      if(!p.deck.some(c=>c.experimentalNeutral)){
        removed.push(...p.deck.slice(0,n));originalMill(p,n,why);
      }else{
        for(let i=0;i<n&&p.deck.length;i++){
          const idx=cost?0:p.deck.findIndex(c=>c.experimentalNeutral);
          const card=p.deck.splice(idx<0?0:idx,1)[0];p.discard.push(card);removed.push(card);
        }
        log(p.name+'：'+why+'で山札から'+removed.length+'枚を捨て札（実験：'+(cost?'上からの使用コスト':'無色優先の破壊')+'）');
      }
      if(before-p.deck.length!==removed.length)throw Error('mill conservation');
      const neutral=removed.filter(c=>c.experimentalNeutral).length,normal=removed.length-neutral;
      EXP.players[p.idx][cost?'costNeutral':'destroyNeutral']+=neutral;
      EXP.players[p.idx][cost?'costNormal':'destroyNormal']+=normal;
      EXP.calls.push({p:p.idx,why,cost,n,actual:removed.length,neutral,normal});
    };
  `);
 });
 return {c,run,errors,experimental};
}
const references=new Map(fs.readFileSync(path.join(__dirname,'baseline-reference.jsonl'),'utf8').trim().split('\n').map(s=>{const g=JSON.parse(s);return [g.seed,g]}));
async function play(e,{config,size,game,seed=1000000+OLD_CONFIG[config]*10000+game,watchdog=true}){
 e.errors.length=0;
 if(e.experimental)e.run('resetExperiment()');
 const decks=CONFIGS[config],first=game%2;
 e.run(`globalThis.events=[];globalThis.decisions=0;CONFIG.deckSize=30;
 setupGame({decks:${JSON.stringify(decks)},ctls:[Solver.makeSolver(),Solver.makeSolver()],ai:[true,true],first:${first},deckSize:30,delay:0,rng:Replay.mulberry32(${seed}),
  hooks:{stat:s=>{if(s.t==='res')events.push({...s,damage:P.map(p=>p.damage.length)});},turnEnd:()=>{if(G.turn>300)throw Error('turn watchdog');}}});`);
 if(e.experimental)e.run(`for(const p of P)for(let i=0;i<${size-30};i++)p.deck.push(makeNeutral());`);
 else if(size!==30)throw Error('plain engine only supports baseline 30');
 if(watchdog)e.run(`for(const p of P){const inner=p.ctl,w=Object.create(inner);for(const m of ['prepAction','chooseGauge','attack','defend','heavy','chain','pickCards'])w[m]=async function(...a){if(++decisions>20000)throw Error('decision watchdog');return inner[m].apply(this,a);};p.ctl=w;}`);
 await e.run('runGame()');
 const raw=JSON.parse(e.run(`JSON.stringify({over:G.over,turn:G.turn,events,decisions,players:P.map(p=>({damage:p.damage.length,deck:p.deck.length,hand:p.hand.length,neutralDeck:p.deck.filter(c=>c.experimentalNeutral).length,neutralHand:p.hand.filter(c=>c.experimentalNeutral).length,neutralDamage:p.damage.filter(c=>c.experimentalNeutral).length,neutralDiscard:p.discard.filter(c=>c.experimentalNeutral).length})),logs:G.log.map(x=>x.s)${e.experimental?',experiment:EXP':''}})`));
 if(!raw.over||e.errors.length)throw Error(JSON.stringify({config,size,game,seed,errors:e.errors,over:raw.over}));
 const winner=1-raw.over.loser,ki=decks.indexOf('葛城・削り'),hi=decks.indexOf('雲雀・反撃');
 const counter=hi>=0&&winner===hi&&raw.over.why==='5ダメージ'&&raw.events.some(s=>s.p!==hi&&s.def&&!s.success&&s.turn<raw.turn)&&raw.events.at(-1)?.p===hi&&raw.events.at(-1).success;
 const players=raw.players.map((p,i)=>{
  const a=raw.events.filter(s=>s.p===i),d=raw.events.filter(s=>s.p!==i);
  const count=t=>raw.logs.filter(s=>s.startsWith('P'+(i+1)+'：')&&s.includes(t)).length;
  return {...p,...(raw.experiment?.players[i]||{}),attacks:a.length,hits:a.filter(s=>s.success).length,incoming:d.length,defensePlayed:d.filter(s=>s.def).length,defenseWins:d.filter(s=>s.def&&!s.success).length,
   heavyCards:a.reduce((n,s)=>n+s.aHeavy,0)+d.reduce((n,s)=>n+s.dHeavy,0),chainAttempts:a.filter(s=>s.mode).length,chainHits:a.filter(s=>s.mode&&s.success).length,
   recoveryUses:count('サポート「牛乳」を使用'),greenScrollUses:count('サポート「緑の巻物」を使用'),attackPasses:count('バトルを行わない'),enemyHeavyOnGuards:d.filter(s=>s.def&&!s.success).reduce((n,s)=>n+s.aHeavy,0)};
 });
 for(const p of players)if(p.neutralDeck+p.neutralHand+p.neutralDamage+p.neutralDiscard!==size-30)throw Error('neutral conservation failed');
 let baselineMatch=null;
 if(size===30){const r=references.get(seed);if(!r)throw Error('missing baseline seed');
  const keys=['damage','deck','hand','attacks','hits','incoming','defensePlayed','defenseWins','heavyCards','chainAttempts','chainHits','recoveryUses','greenScrollUses','attackPasses','enemyHeavyOnGuards'];
  baselineMatch=r.winner===winner&&r.reason===raw.over.why&&r.turn===raw.turn&&keys.every(k=>players.every((p,i)=>p[k]===r.players[i][k]));
  if(!baselineMatch)throw Error('baseline mismatch seed '+seed);
 }
 return {config,size,game,seed,first,decks,winner,reason:raw.over.why,turn:raw.turn,players,hibariCounterWin:!!counter,katsuragiWin:winner===ki,baselineMatch,decisions:raw.decisions,millSources:raw.experiment?.calls||[]};
}
module.exports={engine,play,CONFIGS,OLD_CONFIG,SOURCE_COMMIT,HASH};
