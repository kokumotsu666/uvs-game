const assert=require('node:assert/strict');const {engine,play,CONFIGS}=require('./runtime.cjs');
const e=engine();let checks=0;
function test(name,code){assert(e.run(code),name);console.log('PASS '+name);checks++;}
(async()=>{
 e.run(`CONFIG.deckSize=30;setupGame({decks:['葛城・削り','雲雀・反撃'],ctls:[Solver.makeSolver(),Solver.makeSolver()],ai:[true,true],first:0,rng:Replay.mulberry32(1)});`);
 test('ordinary 30 cards, unchanged lists',`Object.values(FIXED).every(d=>d.list.reduce((n,x)=>n+x[1],0)===30)`);
 test('destruction neutral priority and normal top fallback',`(()=>{resetExperiment();const p=P[0],a=inst(CARDS['はじめのチョップ']),b=inst(CARDS['残月']),x=makeNeutral(),y=makeNeutral();p.deck=[a,x,b,y];p.discard=[];mill(p,3,'葛城Lv5');return p.deck.length===1&&p.deck[0]===b&&p.discard[0]===x&&p.discard[1]===y&&p.discard[2]===a&&EXP.players[0].destroyNeutral===2&&EXP.players[0].destroyNormal===1;})()`);
 test('mill shortage and empty library',`(()=>{resetExperiment();const p=P[0];p.deck=[makeNeutral()];p.discard=[];mill(p,3,'雲雀Lv5');mill(p,2,'効果');return p.deck.length===0&&p.discard.length===1&&EXP.players[0].destroyNeutral===1;})()`);
 test('self-cost stays top-first',`(()=>{resetExperiment();const p=P[0],a=inst(CARDS['残月']),x=makeNeutral();p.deck=[a,x];p.discard=[];CARDS['リミットブレイク'].onReveal({me:p});return p.discard[0]===a&&p.discard[1]===x&&EXP.players[0].costNormal===1&&EXP.players[0].costNeutral===1&&EXP.players[0].destroyNeutral===0;})()`);
 test('neutral normal draw; inert in all battle roles',`(()=>{resetExperiment();const p=P[0],a=inst(CARDS['残月']),x=makeNeutral();p.deck=[a,x];p.hand=[];const n=draw(p,2);return n===2&&p.hand[0]===a&&p.hand[1]===x&&EXP.players[0].drawNeutral===1&&!baseUsable(p,x)&&!canAttack(p,x,null)&&!canAttack(p,x,'R')&&!canDefend(p,x)&&!heavyOK(p,x)&&!['battle','support'].includes(x.type);})()`);
 test('return-to-bottom is ordinary, not destruction',`(()=>{const p=P[0],x=p.hand.find(c=>c.experimentalNeutral);toBottom(p,[x],'test');return p.deck.at(-1)===x&&!p.hand.includes(x)&&EXP.players[0].drawNeutral===1;})()`);
 e.run(`globalThis.p=P[0];p.charDeck=[p.charDeck.at(-1)];p.damage=[{}, {}, {}];p.deck=[makeNeutral(),inst(CARDS['残月'])];`);
 await e.run(`applyDamage(p,1,'test')`);
 test('damage placement uses top, not draw or mill',`p.damage.length===4&&p.damage.at(-1).experimentalNeutral&&p.deck.length===1&&EXP.players[0].drawNeutral===1`);
 test('extra-card closure uses experimental destruction',`(()=>{resetExperiment();const p=P[1],a=inst(CARDS['残月']),x=makeNeutral();p.deck=[a,x];p.discard=[];CARDS['ドラゴンベアード'].onWin({opp:p,oppCard:null});return p.deck[0]===a&&p.discard[0]===x&&EXP.players[1].destroyNeutral===1;})()`);
 // Same normal deck shuffle and opening hand, independent of neutral count.
 const order=[];
 for(const size of [30,35,40]){const q=engine();order.push(q.run(`CONFIG.deckSize=30;setupGame({decks:['葛城・削り','柳生・射撃'],ctls:[Solver.makeSolver(),Solver.makeSolver()],ai:[true,true],first:0,rng:Replay.mulberry32(88)});for(const p of P)for(let i=0;i<${size-30};i++)p.deck.push(makeNeutral());JSON.stringify(P.map(p=>({hand:p.hand.map(c=>c.name),normal:p.deck.filter(c=>!c.experimentalNeutral).map(c=>c.name),tail:p.deck.slice(26).every(c=>c.experimentalNeutral),length:p.deck.length})))`));}
 const data=order.map(JSON.parse);for(let j=1;j<3;j++)for(let i=0;i<2;i++){assert.deepEqual(data[0][i].normal,data[j][i].normal);assert.deepEqual(data[0][i].hand,data[j][i].hand);assert(data[j][i].tail);assert.equal(data[j][i].length,[26,31,36][j]);}checks++;console.log('PASS identical normal shuffle and neutral bottom in 3 conditions');
 for(let config=0;config<4;config++){
  const plain=engine(false),exp=engine();
  const a=await play(plain,{config,size:30,game:0,watchdog:false});const b=await play(exp,{config,size:30,game:0});
  for(const key of ['winner','reason','turn'])assert.equal(a[key],b[key]);
  assert(a.baselineMatch&&b.baselineMatch);checks++;
 }
 console.log(`PASS ${checks} scenario/configuration checks; baseline first seed matches for all four seats`);
})().catch(err=>{console.error(err);process.exitCode=1});
