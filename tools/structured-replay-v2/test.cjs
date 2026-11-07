'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const api=require('./replay.js');
const {format}=require('./normal-log.js');
const {compare,digest}=require('./compare.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,'examples',file),'utf8');
const archived=read('match.replay.jsonl');
const {context,replay,events,current}=api.decode(archived);
assert.equal(api.encode(context,replay,events,current)+'\n',archived);
assert.equal(format(context,events,{ended:true})+'\n',read('match.normal.txt'));
assert.equal(api.expandArchive({replay,events},JSON.parse(read('match.ai-diagnostics.json'))).length,293);
assert.throws(()=>api.decode(archived.trimEnd().split('\n').slice(0,-1).join('\n')));
assert.throws(()=>api.decode(archived.replace('"version":2','"version":42')));
assert.throws(()=>api.assertCompatible(context,{...context,ruleVersion:'v1.11'}));

const one=context.cards.find(c=>context.cards.some(other=>other.name===c.name&&other.uid!==c.uid));
const two=context.cards.find(c=>c.uid!==one.uid&&c.name===one.name);
const source=['rule','テスト効果'];
const testEvents=[
  {type:'draw',turn:1,phase:'draw',actor:0,source,audience:0,data:{uids:[one.uid],requested:1,handCount:5}},
  {type:'mill',turn:1,phase:'battle',actor:1,source,audience:'public',data:{uids:[two.uid],requested:1}},
  {type:'ability-opportunity',turn:1,phase:'battle',actor:1,source:['ability','テスト能力'],audience:'public',
    data:{ability:'テスト能力',level:2,availability:'available',targets:[two.uid]}},
  {type:'ability-result',turn:1,phase:'battle',actor:1,source:['ability','テスト能力'],audience:'public',
    data:{ability:'テスト能力',level:2,result:'declined',targets:[],change:null}},
  ...['no-legal','human-pass','cpu-pass'].map(reason=>({
    type:'defense',turn:1,phase:'battle',actor:1,source:null,audience:'public',
    data:{uid:null,reason,legal:reason==='no-legal'?[]:[two.uid]}}))
];
const collector=api.capture(context,{keepDiagnostics:true});
const event=structuredClone(testEvents[0]);
event.diagnostic={score:42};
collector.receive(event);
event.data.uids[0]=two.uid;
assert.equal(collector.events()[0].data.uids[0],one.uid);
assert(Object.isFrozen(collector.events()[0].data.uids));
assert.equal(collector.diagnostics()[0].trace.score,42);
const withoutDiagnostics=api.capture(context);
withoutDiagnostics.receive({...testEvents[0],diagnostic:{score:42}});
assert.deepEqual(collector.events(),withoutDiagnostics.events());
assert.deepEqual(withoutDiagnostics.diagnostics(),[]);
assert.throws(()=>collector.receive({...testEvents[0],source:null}));
assert.throws(()=>collector.receive({...testEvents[0],data:{...testEvents[0].data,uids:[999999]}}));
const normal=format(context,testEvents,{viewer:1}).split('\n');
assert(!normal[0].includes(one.name));
assert(normal[1].includes(two.name));
assert(normal.some(x=>x.includes('使用を見送った')));
for(const phrase of ['防御可能なカードがなかった','人間が選択しなかった','CPUが選択しなかった'])
  assert(normal.some(line=>line.includes(phrase)));
const short=api.decode(api.encode(context,replay,testEvents)).events;
assert.deepEqual(short,testEvents);
assert.notEqual(short[0].data.uids[0],short[1].data.uids[0]);
assert(!api.encode(context,replay,[{...testEvents[0],diagnostic:{large:'diagnostic-only'}}]).includes('diagnostic-only'));

const comparisonCase={id:'synthetic-contract-test',context,result:{ops:replay.ops,winner:1,reason:'5ダメージ',
  damageHistory:[],turn:13,finalZones:current.players.map(p=>p.zones)},events:testEvents,normal:'試験\r\n'};
const bundle=(role,c)=>({format:'UVS comparison cases',version:1,role,cases:[c]});
const pc=bundle('pc',comparisonCase), html=bundle('html',{...comparisonCase,normal:'試験\n'});
const check=compare(pc,html,1);
assert.equal(check.A+check.B+check.C,0);
assert.equal(check.rngUnavailable,1);
html.cases[0].normal='表記変更';
assert.deepEqual([compare(pc,html,1).A,compare(pc,html,1).C],[0,1]);
html.cases[0].events=[...testEvents.slice(0,1),...testEvents.slice(2)];
assert.equal(compare(pc,html,1).cases[0].firstEventDifference,1);
assert.equal(digest({z:1,a:-0}),digest({a:0,z:1}));
assert.throws(()=>compare(pc,html),/60/);
assert.throws(()=>compare(pc,bundle('html',{...comparisonCase,events}),1),/Archived/);

(async()=>{
  let prepared=0, committed=0;
  const options={installed:context,parseLegacy:s=>({old:s}),prepare:async()=>{prepared++;return 1;},commit:n=>{committed++;return n;}};
  assert.equal(await api.load(archived,options),1);
  assert.equal(await api.load('#UVS v1.9 replay',options),1);
  await assert.rejects(api.load(archived+'\n[',options));
  await assert.rejects(api.load(archived,{...options,prepare:async()=>{throw new Error('replay failed');}}));
  assert.equal(prepared,2);
  assert.equal(committed,2);
  const iterations=30;
  for(let i=0;i<4;i++)api.decode(archived);
  const memoryStart=process.memoryUsage().heapUsed;
  const start=performance.now();
  for(let i=0;i<iterations;i++)api.decode(archived);
  const decodeMs=(performance.now()-start)/iterations;
  const memoryEnd=process.memoryUsage().heapUsed;
  const encodeStart=performance.now();
  for(let i=0;i<iterations;i++)api.encode(context,replay,events,current);
  const encodeMs=(performance.now()-encodeStart)/iterations;
  console.log(JSON.stringify({checks:'pass',decodeMs,encodeMs,iterations,heapDeltaBytes:memoryEnd-memoryStart},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
