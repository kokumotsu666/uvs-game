'use strict';

// Reuse the already existing v1 fixture and its recorded observer. This is an
// offline conversion, not the event producer for the new HTML or simulator.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {importArchive,decode,expandArchive}=require('./replay.js');
const {format}=require('./normal-log.js');
const archive=path.resolve(process.argv.slice(2).find(x=>x!=='--verify')||path.join(__dirname,'../logs_v1'));
const source=fs.readFileSync(path.join(archive,'verify_logs.cjs'),'utf8').replace(/\r\n/g,'\n');
const marker='(async()=>{\n  let games=0;';
const boundary=source.lastIndexOf(marker);
if(boundary<0)throw new Error('Unknown v1 verification fixture layout');
const adapter=new Function('require','__dirname','verify',source.slice(0,boundary)+String.raw`
  clearTimeout(watchdog);
  return (async()=>{
    let games=0;
    if(verify){
      for(let a=0;a<5;a++)for(let b=a;b<5;b++)for(let i=0;i<2;i++)for(let sa=0;sa<2;sa++){
        old.fixture=next.fixture={decks:[keys[sa?b:a],keys[sa?a:b]],seed:19070000+a*1000+b*100+i*7};
        assert.deepEqual(json(await run(next,engineGame)),json(await run(old,engineGame)));
        games++;
      }
    }
    next.fixture={...fixture,enabled:true};
    const match=json(await run(next,mixed));
    next.fixture={...fixture,enabled:false};
    const off=json(await run(next,mixed));
    assert.deepEqual(off.ops,match.ops);
    assert.deepEqual(off.state,match.state);
    assert.equal(off.shadowMismatch,0);
    next.fixture=fixture;
    const data=json(run(next,\`(()=>{
      const ctl={};setupGame({decks:fixture.decks,ctls:[ctl,ctl],ai:[false,true],deckSize:30,rng:Replay.mulberry32(fixture.seed)});
      return {rules:CONFIG,content:DETAIL_CONTENT_ID,cards:P.flatMap(p=>[...p.hand,...p.deck,...p.charDeck])
        .sort((a,b)=>a.uid-b.uid).map(c=>({uid:c.uid,id:c.id,name:c.name,type:c.type,...(c.type==='char'?{level:c.lv}:{})}))};
    })()\`));
    return {match,data,games,auditText};
  })();
`.replaceAll('\\`','`'));

(async()=>{
  const {match,data,games,auditText}=await adapter(require,archive,process.argv.includes('--verify'));
  assert.equal(match.shadowMismatch,0);
  const raw=JSON.parse(match.detail),meta=raw.metadata;
  const context={
    ruleVersion:meta.rules,gameVersion:meta.game,uiVersion:meta.ui,
    cardVersion:'v1.8 + green-scroll-mode-1; '+data.content,implementation:data.content,
    rng:meta.rng,seed:meta.seed,rngFirst:meta.rngFirst,first:meta.first,controllers:meta.controllers,
    decks:meta.decks.map((name,i)=>({name,list:meta.deckLists[i]})),ai:meta.profiles,solver:meta.solver,
    cards:data.cards,
    parameters:{...data.rules,greenScrollMode:1,loMode:'damage-area-comparison',loTie:'lo-side-loses'},
    formulas:{
      attack:'character AT + turn modifier + main card AT + heavy AT + enabled card and character modifiers',
      defense:'character DF + turn modifier + main card DF + heavy DF + enabled card and character modifiers',
      damage:'max(0, attacker card DP + enabled defender DP modifier)',
      battle:'AT vs DF with configured tie winner; undefended automatic hit and green defense follow configured rules',
      lo:'at start of draw phase with an empty deck: compare damage area counts; higher count loses; tie loses for LO side',
      greenScroll:'floor(own damage area count / 2), limited by remaining deck',
      fiveDamage:'at configured winDamage; final damage adds no level and consumes no deck card',
      gp:'the side needs at least the required counts in both gauges; secret-technique cost uses eligible 閃・陽・陰 cards'
    },
    provenance:'logs_v1 archived observation, reconstructed from supplied v1.9 operation sequence',
    archivePrelude:match.normal.slice(0,1)
  };
  const {text,diagnostics}=importArchive(raw,context);
  const decoded=decode(text);
  assert.deepEqual(expandArchive(decoded,diagnostics),raw.observation.events);
  assert.deepEqual(decoded.replay,raw.replay);
  assert.deepEqual(decoded.current,raw.observation.current);
  assert.equal(format(context,decoded.events,{ended:true}),match.normal.join('\n'));
  async function prepare(packet){
    if(packet.kind==='legacy')return auditText(packet.replay);
    // Use the existing v1 isolated audit as an offline test adapter for replay input.
    // No events are produced by this adapter.
    const {context:c,replay}=packet;
    const metadata={...meta,seed:c.seed,first:c.first,rngFirst:c.rngFirst};
    return auditText(JSON.stringify({format:raw.format,version:raw.version,metadata,replay}));
  }
  const codec=require('./replay.js');
  const options={installed:context,parseLegacy:value=>value,prepare,commit:value=>value};
  const ended=await codec.load(text,options),legacy=await codec.load(match.legacy,options);
  assert.deepEqual(ended.state,match.state);
  assert.deepEqual(legacy.state,match.state);
  const mid=JSON.parse(match.mid);
  const partial=await codec.load(importArchive(mid,context).text,options);
  assert.equal(partial.consumed,22);
  assert.deepEqual(partial.state,raw.observation.events.filter(e=>e.kind==='decision')[22].before);
  const dir=path.join(__dirname,'examples');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'match.replay.jsonl'),text+'\n');
  fs.writeFileSync(path.join(dir,'match.normal.txt'),match.normal.join('\n')+'\n');
  fs.writeFileSync(path.join(dir,'match.ai-diagnostics.json'),JSON.stringify(diagnostics)+'\n');
  const sizes={seed:meta.seed,operations:raw.replay.ops.length,events:decoded.events.length,
    v1:Buffer.byteLength(match.detail),v2:Buffer.byteLength(text+'\n'),
    diagnostics:Buffer.byteLength(JSON.stringify(diagnostics)+'\n'),losslessArchive:true,
    archiveNormalLines:match.normal.length,archivedHtmlCases:games,archivedHtmlDifferences:0,
    legacyAndCompactEnd:true,compactPartialOps:22,observationModesMatch:true};
  fs.writeFileSync(path.join(dir,'sizes.json'),JSON.stringify(sizes,null,2)+'\n');
  console.log(sizes);
})().catch(e=>{console.error(e);process.exitCode=1;});
