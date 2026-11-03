// Re-run selected Hibari wins to retain full real battle events and logs.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const rows=fs.readFileSync(path.join(__dirname,'main-games.jsonl'),'utf8').trim().split('\n').map(JSON.parse).sort((a,b)=>a.config-b.config||a.game-b.game);
const chosen=[];
for(const [label,select] of [
 ['防御後の5ダメージ勝利',g=>g.hibariPattern?.counterDamageWin],
 ['3ダメージ以上からの反撃勝利',g=>g.hibariPattern?.lateCounterDamageWin],
 ['相手の山札切れ勝利',g=>g.hibariPattern?.deckoutWin],
])for(const g of rows.filter(g=>select(g)&&!chosen.some(x=>x.g.seed===g.seed)).slice(0,2))chosen.push({label,g});
const c=vm.createContext({console,setTimeout,clearTimeout});c.window=c;
for(const m of fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(m[1].replace(/startScreen\(\);\s*$/,''),c);
const run=s=>vm.runInContext(s,c);
(async()=>{
 const output=[];
 for(const {label,g} of chosen){
  run(`globalThis.events=[];CONFIG.deckSize=30;setupGame({decks:${JSON.stringify(g.decks)},ctls:[Solver.makeSolver(),Solver.makeSolver()],ai:[true,true],first:${g.first},deckSize:30,delay:0,rng:Replay.mulberry32(${g.seed}),hooks:{stat:s=>{
   if(s.t==='res')events.push({...s,attackCard:G.bs.atk.card.name,defenseCard:G.bs.def.card?.name||null,attackHeavy:G.bs.atk.heavy.map(c=>c.name),defenseHeavy:G.bs.def.heavy.map(c=>c.name),damage:P.map(p=>p.damage.length),hand:P.map(p=>p.hand.length)});
  }}});`);
  await run('runGame()');
  const observed=JSON.parse(run('JSON.stringify({winner:1-G.over.loser,reason:G.over.why,turn:G.turn,events,log:G.log.map(x=>x.s)})'));
  assert.equal(observed.winner,g.winner);assert.equal(observed.turn,g.turn);assert.equal(observed.reason,g.reason);
  output.push({label,config:g.config,game:g.game,seed:g.seed,decks:g.decks,first:g.first,...observed});
 }
 fs.writeFileSync(path.join(__dirname,'hibari-examples.json'),JSON.stringify(output,null,2)+'\n');
 console.log(`PASS: ${output.length} illustrative wins replayed with matching outcomes`);
})().catch(e=>{console.error(e);process.exitCode=1});
