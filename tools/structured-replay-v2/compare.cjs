'use strict';

const fs=require('node:fs');
const crypto=require('node:crypto');
const {capture}=require('./replay.js');
const FORMAT='UVS comparison cases';
function canonical(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'&&Number.isFinite(value))return Object.is(value,-0)?0:value;
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  throw new Error('Comparison value is not JSON data');
}
const hash=text=>crypto.createHash('sha256').update(text,'utf8').digest('hex');
const digest=value=>hash(JSON.stringify(canonical(value)));
function resultFields(result){
  const fields=['ops','winner','reason','damageHistory','turn','finalZones'];
  if(!result||fields.some(field=>!Object.hasOwn(result,field)))throw new Error('Missing A data: '+fields.join(', '));
  return Object.fromEntries(fields.map(field=>[field,result[field]]));
}
function normalizeEvents(context,events){
  if(!Array.isArray(events))throw new Error('Missing B event data');
  const collector=capture(context);
  for(const e of events){
    if(e.type==='legacy-observation')throw new Error('Archived observations cannot certify canonical events');
    collector.receive(e);
  }
  return collector.events().map(({type,turn,phase,actor,source,data})=>({type,turn,phase,actor,source,data}));
}
function textHash(value){
  if(typeof value!=='string')throw new Error('Missing C plain log');
  return hash(value.replace(/\r\n?/g,'\n'));
}
function index(bundle,role,count){
  if(bundle.format!==FORMAT||bundle.version!==1||bundle.role!==role||!Array.isArray(bundle.cases)
    ||bundle.cases.length!==count)throw new Error('Expected '+count+' cases for '+role);
  const result=new Map(bundle.cases.map(item=>[item.id,item]));
  if(result.size!==count||[...result.keys()].some(id=>typeof id!=='string'||!id))throw new Error('Invalid or duplicate case IDs');
  return result;
}
function compare(pc,html,count=60){
  const canonicalCases=index(pc,'pc',count),htmlCases=index(html,'html',count);
  const report=[];
  for(const [id,left] of canonicalCases){
    const right=htmlCases.get(id);
    if(!right)throw new Error('Missing HTML case '+id);
    // Role-specific executable hashes belong in bundle metadata. Shared compatibility and test parameters must match.
    const conditions=['ruleVersion','gameVersion','cardVersion','rng','seed','rngFirst','first','decks','controllers','ai','parameters','formulas','solver','cards'];
    if(conditions.some(k=>!Object.hasOwn(left.context,k)||!Object.hasOwn(right.context,k)))throw new Error('Missing comparison condition for '+id);
    const common=c=>Object.fromEntries(conditions.map(k=>[k,k==='cards'?[...c.cards].sort((a,b)=>a.uid-b.uid):c[k]]));
    if(digest(common(left.context))!==digest(common(right.context)))throw new Error('Different input conditions for '+id);
    const ar=[resultFields(left.result),resultFields(right.result)];
    const br=[normalizeEvents(left.context,left.events),normalizeEvents(right.context,right.events)];
    const A=ar.map(digest),B=br.map(digest),C=[textHash(left.normal),textHash(right.normal)];
    const rng=[left.result.rngState??null,right.result.rngState??null];
    const rngEqual=rng.some(x=>x===null)?null:digest(rng[0])===digest(rng[1]);
    let firstEventDifference=null;
    if(B[0]!==B[1]){
      firstEventDifference=0;
      while(firstEventDifference<Math.min(br[0].length,br[1].length)
        &&digest(br[0][firstEventDifference])===digest(br[1][firstEventDifference]))firstEventDifference++;
    }
    report.push({id,implementations:[left.context.implementation,right.context.implementation],A,B,C,rngEqual,firstEventDifference});
  }
  return {count,A:report.filter(r=>r.A[0]!==r.A[1]||r.rngEqual===false).length,
    B:report.filter(r=>r.B[0]!==r.B[1]).length,C:report.filter(r=>r.C[0]!==r.C[1]).length,
    rngUnavailable:report.filter(r=>r.rngEqual===null).length,cases:report};
}
if(require.main===module){
  const [pc,html,out]=process.argv.slice(2);
  if(!pc||!html||!out)throw new Error('Usage: node compare.cjs pc-60.json html-60.json comparison.json');
  const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
  const result=compare(read(pc),read(html));
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({count:result.count,A:result.A,B:result.B,C:result.C,rngUnavailable:result.rngUnavailable}));
  if(result.A||result.B)process.exitCode=1;
}
module.exports={compare,digest};
