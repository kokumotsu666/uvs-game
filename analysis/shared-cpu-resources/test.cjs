const assert=require('node:assert/strict');const {load,game,BASE}=require('./harness.cjs');
const a=load(BASE),b=load('candidate');
const invariant=`JSON.stringify({CONFIG,CARDS,CHARS,DECKS},(k,v)=>typeof v==='function'?v.toString():v)`;
assert.equal(a.run(invariant),b.run(invariant));assert.equal(a.html.match(/<style>[\s\S]*?<\/style>/)[0],b.html.match(/<style>[\s\S]*?<\/style>/)[0]);
console.log('PASS unchanged rules/cards/deck definitions/CSS');
function setup(){b.run(`CONFIG.deckSize=30;setupGame({decks:['柳生・射撃','葛城・削り'],ctls:[Solver.makeSolver(),Solver.makeSolver()],ai:[true,true],first:0,rng:Replay.mulberry32(100)});`);}
(async()=>{
 setup();assert(b.run(`(()=>{const p=P[0];p.hand=[CARDS['天刃'],CARDS['連刃']];p.deck=Array(20).fill(null);const rich=CPU_RESOURCES.drawValue(p,2);p.deck=Array(3).fill(null);return CPU_RESOURCES.drawValue(p,2)<rich})()`));
 setup();assert(b.run(`(()=>{const p=P[0];p.deck=Array(20).fill(null);p.hand=[CARDS['天刃']];const low=CPU_RESOURCES.drawValue(p,2);p.hand=Array(8).fill(CARDS['天刃']);return CPU_RESOURCES.drawValue(p,2)<low})()`));
 setup();assert(b.run(`(()=>{const p=P[0],o=P[1];p.deck=Array(4).fill(null);o.charDeck=[CHARS['葛城・削り'].at(-1)];CPU_RESOURCES.beginDecision();const danger=CPU_RESOURCES.drawValue(p,2);o.charDeck=[CHARS['葛城・削り'][0]];CPU_RESOURCES.beginDecision();return CPU_RESOURCES.drawValue(p,2)>danger})()`));
 setup();assert(b.run(`(()=>{const p=P[0];p.gYo=Array(4).fill({});p.gIn=Array(4).fill({});p.hand=[CARDS['天刃'],CARDS['くぐつダミー']];const cost=CPU_RESOURCES.spendCost(p,[p.hand[1]],[p.hand[0]]);p.hand.push(CARDS['くぐつダミー'],CARDS['天刃']);return cost>CPU_RESOURCES.spendCost(p,[p.hand[1]],p.hand.filter((c,i)=>i!==1))})()`));
 setup();assert(b.run(`(()=>{P[0].ctl=Solver.makeSolver({resources:{horizonTurns:3}});return CPU_RESOURCES.profile(P[0]).horizonTurns===3&&CPU_RESOURCES.profile(P[1]).horizonTurns===2})()`));
 console.log('PASS deck horizon, hand saturation, public mill threat, option cost, parameter override');
 // Hidden arrays expose only public lengths. Numeric/iterator reads throw.
 setup();b.run(`P[0].hand=[inst(CARDS['天刃']),inst(CARDS['くぐつダミー']),inst(CARDS['踊り傘'])];for(const p of P){p.gYo=Array(4).fill({name:'test',type:'battle',uid:-101});p.gIn=Array(4).fill({name:'test',type:'battle',uid:-102});}
 P[1].hand=new Proxy(P[1].hand,{get(t,k){if(k==='length')return t.length;throw Error('private enemy hand read '+String(k));}});
 P[1].deck=new Proxy(P[1].deck,{get(t,k){if(k==='length')return t.length;throw Error('private enemy deck read '+String(k));}});`);
 await b.run(`Solver.assess('attack',P[0],[P[0].hand.filter(c=>canAttack(P[0],c,null)),null],P[0].ctl)`);
 b.run(`G.bs={stage:'def',atk:{p:P[1],get card(){throw Error('private face-down card read');},heavy:[]},def:{p:P[0],card:null,heavy:[]}};`);
 await b.run(`Solver.assess('defend',P[0],[P[0].hand.filter(c=>canDefend(P[0],c)),{attacker:P[1],mode:null}],P[0].ctl)`);
 console.log('PASS actual solver attack/defense cannot read opponent hidden arrays or face-down card');
 // Identical public state and RNG must give identical strategy despite hidden permutation.
 setup();b.run("P[0].gYo=Array(4).fill({type:'battle',name:'test',uid:-101});P[0].gIn=Array(4).fill({type:'battle',name:'test',uid:-102});P[0].hand=[inst(CARDS['天刃']),inst(CARDS['くぐつダミー'])];");const expression=`RNG=Replay.mulberry32(777);Solver.assess('attack',P[0],[P[0].hand.filter(c=>canAttack(P[0],c,null)),null],P[0].ctl)`;
 const x=JSON.stringify(await b.run(expression));b.run(`const hidden=P[1].deck.concat(P[1].hand).reverse();const h=P[1].hand.length;P[1].hand=hidden.slice(0,h);P[1].deck=hidden.slice(h);`);
 assert.equal(JSON.stringify(await b.run(expression)),x);
 console.log('PASS hidden partition/order invariance under same public state and RNG');
 for(let c=0;c<20;c++)await game(b,c,0);
 console.log('PASS all 20 configurations complete with shared resource management');
})().catch(e=>{console.error(e);process.exitCode=1});
