const assert=require('node:assert/strict');const {meteredEngine,measure,scripts,classify}=require('./meter.cjs');
(async()=>{
 let sites=0;
 for(let script=0;script<scripts.length;script++)scripts[script].split('\n').forEach((line,i)=>{
  if(/\bdraw\(/.test(line)&&!line.includes('function draw(')){
   const result=classify({script,line:i+1},{charName:'柳生',charDeck:[{lv:2}]});assert(!result[1].startsWith('未分類'),line);sites++;
  }
 });
 console.log('PASS static draw-call site coverage: '+sites+' lines');
 const e=meteredEngine();
 for(const size of [30,35,40])for(let config=0;config<4;config++){
  const r=await measure(e,{size,config,game:0});assert(r.game.referenceMatch);assert.equal(r.game.unclassified,0);
  assert.equal(r.events.filter(x=>x.category==='初期手札').reduce((n,x)=>n+x.actual,0),8);
 }
 console.log('PASS all 12 seat/size first seeds match PR3, including final state and independent library accounting');
 e.run(`resetDrawObserver(35);resetExperiment();P[0].deck=[inst(CARDS['残月']),makeNeutral()];P[0].hand=[];P[0].damage=[{},{},{}];`);
 await e.run(`CARDS['緑の巻物'].use({me:P[0],opp:P[1]})`);
 let events=JSON.parse(e.run('JSON.stringify(DRAWOBS.events)'));let x=events.at(-1);
 assert.equal(x.category,'緑の巻物');assert.equal(x.requested,3);assert.equal(x.actual,2);assert.equal(x.beforeDeck,2);assert.equal(x.beforeNormal,1);assert.equal(x.beforeNeutral,1);assert.equal(x.neutralDrawn,1);
 await e.run(`CARDS['緑の巻物'].use({me:P[0],opp:P[1]})`);
 x=JSON.parse(e.run('JSON.stringify(DRAWOBS.events.at(-1))'));assert.equal(x.requested,3);assert.equal(x.actual,0);
 console.log('PASS short/empty draws measure actual 2/0 rather than requested/logged 3');
 e.run(`CONFIG.deckSize=30;setupGame({decks:['葛城・削り','雲雀・反撃'],ctls:[Solver.makeSolver(),Solver.makeSolver()],ai:[true,true],first:0,rng:Replay.mulberry32(1)});resetDrawObserver(30);const ch=P[0].charDeck.splice(1,1)[0];P[0].damage=[ch];`);
 await e.run(`CARDS['牛乳'].use({me:P[0],opp:P[1]})`);
 x=JSON.parse(e.run('JSON.stringify(DRAWOBS.events.at(-1))'));assert.equal(x.category,'キャラクター能力');assert.equal(x.source,'葛城Lv2:忍転身(onTop)');assert(x.parentSupports.includes('牛乳'));
 console.log('PASS cow-milk-triggered draw remains character ability, with parent support retained');
 e.run(`resetDrawObserver(30);draw(P[0],1)`);
 x=JSON.parse(e.run('JSON.stringify(DRAWOBS.events.at(-1))'));assert(x.unclassified);
 console.log('PASS synthetic unlabelled draw detected (unit test only; excluded from real matches)');
})().catch(e=>{console.error(e);process.exitCode=1});
