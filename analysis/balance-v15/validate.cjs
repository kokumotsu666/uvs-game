// Compare instrumentation against plain production execution, one seed per config.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const rows=fs.readFileSync(path.join(__dirname,'pilot-games.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(g=>g.game===0);
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const c=vm.createContext({console,setTimeout,clearTimeout});c.window=c;
for(const s of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(s[1].replace(/startScreen\(\);\s*$/,''),c);
const run=s=>vm.runInContext(s,c);
(async()=>{
 for(const g of rows){
  run(`CONFIG.deckSize=30;setupGame({decks:${JSON.stringify(g.decks)},ctls:[Solver.makeSolver(),Solver.makeSolver()],ai:[true,true],first:${g.first},deckSize:30,delay:0,rng:Replay.mulberry32(${g.seed})});`);
  await run('runGame()');
  const observed=JSON.parse(run(`JSON.stringify({winner:1-G.over.loser,reason:G.over.why,turn:G.turn,final:P.map(p=>({damage:p.damage.length,deck:p.deck.length,hand:p.hand.length}))})`));
  assert.equal(observed.winner,g.winner);assert.equal(observed.reason,g.reason);assert.equal(observed.turn,g.turn);
  assert.deepEqual(observed.final,g.players.map(({damage,deck,hand})=>({damage,deck,hand})));
 }
 assert.equal(rows.length,20);console.log('PASS: 20 configurations match plain production execution without instrumentation');
})().catch(e=>{console.error(e);process.exitCode=1});
