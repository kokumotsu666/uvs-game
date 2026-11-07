'use strict';

// CommonJS in the comparison tools and a plain script in the future HTML adapter.
(function(root){
  const FORMAT='UVS compact replay';
  const VERSION=2;
  const SCHEMA={
    G:['start',['initial']],
    H:['initial-hand',['uids']],
    D:['draw',['uids','requested','handCount']],
    M:['move',['uids','from','to']],
    X:['mill',['uids','requested']],
    R:['return',['uids','from','placement']],
    N:['gauge',['uids','from','gauge']],
    C:['cost',['uids','from','legal']],
    O:['ability-opportunity',['ability','level','availability','targets']],
    U:['ability-result',['ability','level','result','targets','change']],
    A:['attack',['uid','mode']],
    B:['defense',['uid','reason','legal']],
    W:['heavy',['uid','at','df']],
    K:['chain',['result','uid']],
    J:['battle-result',['at','df','dp','atParts','dfParts','result']],
    P:['damage',['before','after','uids']],
    V:['level',['from','to','uid','at','df','damage']],
    T:['turn-end',['state']],
    E:['end',['winner','loser','reason','loPlayer','state']],
    Q:['decision',['method','legal','selected']],
    L:['legacy-observation',['kind','data','delta','beforeDelta']]
  };
  const codeFor=Object.fromEntries(Object.entries(SCHEMA).map(([code,[type]])=>[type,code]));
  const phaseCodes=[null,'draw','prep','battle','end'];
  const sourced=new Set(['draw','move','mill','return','gauge','cost','ability-opportunity','ability-result','damage','level']);
  const cardEvent=new Set(['initial-hand','draw','move','mill','return','gauge','cost','damage']);
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const uid=value=>Number.isSafeInteger(value)&&value>0;
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const fail=message=>{throw new Error(message);};
  function safeKey(key){
    return typeof key==='string'&&!['__proto__','constructor','prototype'].includes(key);
  }
  function copy(value){
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'&&Number.isFinite(value))return value;
    if(Array.isArray(value))return value.map(copy);
    if(!object(value))fail('Expected JSON-compatible data');
    return Object.fromEntries(Object.entries(value).map(([key,item])=>{
      if(!safeKey(key))fail('Invalid field name: '+key);
      return [key,copy(item)];
    }));
  }
  function freeze(value){
    if(value&&typeof value==='object'){
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function dictionary(context){
    if(!Array.isArray(context.cards))fail('Missing card dictionary');
    const cards=new Map();
    for(const card of context.cards){
      if(!uid(card.uid)||typeof card.id!=='string'||typeof card.name!=='string'||cards.has(card.uid))fail('Invalid card dictionary');
      cards.set(card.uid,card);
    }
    return cards;
  }
  function validateContext(context){
    for(const field of ['ruleVersion','gameVersion','uiVersion','cardVersion','implementation','rng','decks','ai','parameters','formulas','first','controllers','seed','rngFirst','provenance']){
      if(!own(context,field))fail('Missing replay metadata: '+field);
    }
    for(const field of ['ruleVersion','gameVersion','uiVersion','cardVersion','implementation','rng','provenance']){
      if(typeof context[field]!=='string'||!context[field])fail('Invalid replay metadata: '+field);
    }
    if(![0,1].includes(context.first)||!Number.isInteger(context.seed)||context.seed<0||context.seed>0xffffffff
      ||!['fixed','random'].includes(context.rngFirst))fail('Invalid seed or first player');
    for(const field of ['decks','ai','controllers'])if(!Array.isArray(context[field])||context[field].length!==2)fail('Expected two '+field);
    if(!context.controllers.every(c=>['H','S','A'].includes(c))||!object(context.parameters)||!object(context.formulas))fail('Invalid replay context');
    return dictionary(context);
  }
  function validateEvent(event,cards){
    if(!own(codeFor,event.type)||!Number.isSafeInteger(event.turn)||event.turn<0
      ||!phaseCodes.includes(event.phase)||![null,0,1].includes(event.actor)||!object(event.data))fail('Invalid event envelope');
    if(!['public','postgame',0,1].includes(event.audience))fail('Invalid event audience');
    const [,fields]=SCHEMA[codeFor[event.type]];
    for(const name of fields)if(!own(event.data,name))fail(event.type+' missing '+name);
    for(const name of Object.keys(event.data))if(!fields.includes(name))fail(event.type+' unknown '+name);
    if(event.source!==null){
      const [kind,id]=Array.isArray(event.source)?event.source:[];
      if(event.source.length!==2||!['card','ability','rule'].includes(kind)
        ||(kind==='card'?!cards.has(id):typeof id!=='string'||!id))fail('Invalid event source');
    }else if(sourced.has(event.type))fail(event.type+' requires source');
    if(cardEvent.has(event.type)&&(!Array.isArray(event.data.uids)||event.data.uids.some(id=>!cards.has(id))))fail('Invalid event UID list');
    if(['attack','defense','heavy','chain','level'].includes(event.type)&&event.data.uid!==null&&!cards.has(event.data.uid))fail('Unknown event UID');
  }

  function capture(rawContext,{keepDiagnostics=false}={}){
    const context=freeze(copy(rawContext)),cards=validateContext(context);
    const events=[],diagnostics=[];
    return {
      context,
      receive(rawEvent){
        const {diagnostic,...fields}=rawEvent;
        const event=copy(fields);
        event.audience??='postgame';
        validateEvent(event,cards);
        const previous=events.at(-1);
        if(previous&&event.turn<previous.turn)fail('Event turn moved backwards');
        if(keepDiagnostics&&diagnostic!==undefined)diagnostics.push(freeze({event:events.length,trace:copy(diagnostic)}));
        events.push(freeze(event));
      },
      events:()=>events.slice(),
      diagnostics:()=>diagnostics.slice()
    };
  }

  // [0,value] replace, [1, [key,patch]...] object changes, [2,start,count,...items] splice,
  // [3] delete, [4, [index,patch]...] same-length array changes.
  // null means retain the previous value. Array order is never sorted.
  function delta(before,after){
    if(equal(before,after))return null;
    if(Array.isArray(before)&&Array.isArray(after)){
      let start=0,end=0;
      while(start<Math.min(before.length,after.length)&&equal(before[start],after[start]))start++;
      while(end<Math.min(before.length,after.length)-start&&equal(before[before.length-1-end],after[after.length-1-end]))end++;
      const splice=[2,start,before.length-start-end,...after.slice(start,after.length-end)];
      const candidates=[splice,[0,after]];
      if(before.length===after.length){
        const changes=[4];
        after.forEach((value,index)=>{
          const patch=delta(before[index],value);
          if(patch)changes.push([index,patch]);
        });
        candidates.push(changes);
      }
      return candidates.reduce((a,b)=>JSON.stringify(a).length<=JSON.stringify(b).length?a:b);
    }
    if(object(before)&&object(after)){
      const changes=[1];
      for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
        if(!own(after,key)){changes.push([key,[3]]);continue;}
        const patch=own(before,key)?delta(before[key],after[key]):[0,after[key]];
        if(patch)changes.push([key,patch]);
      }
      return changes;
    }
    return [0,after];
  }
  function restore(before,patch){
    if(patch===null)return before;
    if(!Array.isArray(patch))fail('Invalid state delta');
    if(patch[0]===0&&patch.length===2)return copy(patch[1]);
    if(patch[0]===1&&object(before)){
      const value={...before};
      for(const change of patch.slice(1)){
        if(!Array.isArray(change)||change.length!==2||!safeKey(change[0]))fail('Invalid state delta field');
        const [key,child]=change;
        if(Array.isArray(child)&&child.length===1&&child[0]===3)delete value[key];
        else value[key]=restore(value[key],child);
      }
      return value;
    }
    if(patch[0]===2&&Array.isArray(before)){
      const [,start,count,...items]=patch;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||start<0||count<0||start+count>before.length)fail('Invalid array delta');
      return [...before.slice(0,start),...copy(items),...before.slice(start+count)];
    }
    if(patch[0]===4&&Array.isArray(before)){
      const value=before.slice();
      for(const change of patch.slice(1)){
        if(!Array.isArray(change)||change.length!==2||!Number.isSafeInteger(change[0])||change[0]<0||change[0]>=value.length)
          fail('Invalid array delta index');
        value[change[0]]=restore(value[change[0]],change[1]);
      }
      return value;
    }
    fail('Invalid state delta opcode');
  }

  function validateReplay(replay){
    if(!object(replay)||!Array.isArray(replay.ops)||!replay.ops.every(t=>typeof t==='string'&&/^[01][PGADHCK][a-zA-Z0-9.-]+$/.test(t))
      ||!Array.isArray(replay.cardMap)||replay.cardMap.length!==2||!replay.cardMap.every(s=>typeof s==='string'&&s.length>0)
      ||!object(replay.initial)||!object(replay.checkpoint))fail('Invalid replay input or missing initial/checkpoint state');
    const {kind,index,state}=replay.checkpoint;
    if(!['initial','decision','end'].includes(kind)||!Number.isSafeInteger(index)||index<0||index>replay.ops.length
      ||kind==='initial'&&index!==0||kind==='end'&&index!==replay.ops.length||!object(state))fail('Invalid checkpoint');
  }
  function rowDictionary(rows){
    const counts=new Map();
    function add(value){
      if(typeof value==='string')counts.set(value,(counts.get(value)||0)+1);
      else if(Array.isArray(value))value.forEach(add);
      else if(object(value))for(const [key,item] of Object.entries(value)){add(key);add(item);}
    }
    rows.forEach(row=>row.slice(6).forEach(add));
    const encoder=new TextEncoder();
    return [...counts].map(([value,count])=>({value,savings:(encoder.encode(JSON.stringify(value)).length-5)*count-encoder.encode(JSON.stringify(value)).length-1}))
      .filter(item=>item.savings>8).sort((a,b)=>b.savings-a.savings).slice(0,999).map(item=>item.value);
  }
  function mapStrings(value,convert){
    if(typeof value==='string')return convert(value);
    if(Array.isArray(value))return value.map(item=>mapStrings(item,convert));
    if(object(value)){
      const entries=Object.entries(value).map(([key,item])=>[convert(key),mapStrings(item,convert)]);
      if(new Set(entries.map(([key])=>key)).size!==entries.length)fail('Duplicate decoded field');
      return Object.fromEntries(entries);
    }
    return value;
  }
  function encode(context,replay,events,current=null){
    validateReplay(replay);
    const collector=capture(context);
    for(const event of events)collector.receive(event);
    const rows=collector.events().map(e=>{
      const code=codeFor[e.type],fields=SCHEMA[code][1];
      return [code,e.turn,phaseCodes.indexOf(e.phase),e.actor,e.source,e.audience,...fields.map(name=>e.data[name])];
    });
    const strings=rowDictionary(rows);
    const indexes=new Map(strings.map((value,index)=>[value,index]));
    const pack=value=>indexes.has(value)?'~'+indexes.get(value):value.startsWith('~')?'~'+value:value;
    const header={format:FORMAT,version:VERSION,context:collector.context,legend:SCHEMA,phaseCodes,strings,
      row:['code','turn','phaseIndex','actor','source','audience','…data fields in legend order'],
      source:'null or [card, uid], [ability, id], [rule, id]',
      nullable:'null means unavailable or not applicable; see event type',replay:copy(replay)};
    return JSON.stringify(header)+'\n'+rows.map(row=>JSON.stringify([...row.slice(0,6),...row.slice(6).map(value=>mapStrings(value,pack))])+'\n').join('')
      +JSON.stringify(['Z',rows.length,current===null?null:copy(current)]);
  }
  function decode(text){
    const lines=text.trim().split(/\r?\n/);
    const header=copy(JSON.parse(lines.shift()));
    if(header.format!==FORMAT||header.version!==VERSION||!equal(header.legend,SCHEMA)||!equal(header.phaseCodes,phaseCodes))fail('Unsupported compact replay format');
    const strings=header.strings;
    if(!Array.isArray(strings)||strings.length>999||strings.some(s=>typeof s!=='string')||new Set(strings).size!==strings.length)fail('Invalid string table');
    function unpack(value){
      if(!value.startsWith('~'))return value;
      if(value.startsWith('~~'))return value.slice(1);
      if(!/^~(?:0|[1-9][0-9]*)$/.test(value)||!own(strings,Number(value.slice(1))))fail('Invalid string table reference');
      return strings[Number(value.slice(1))];
    }
    validateReplay(header.replay);
    const trailer=copy(JSON.parse(lines.pop()));
    if(!Array.isArray(trailer)||trailer.length!==3||trailer[0]!=='Z'||trailer[1]!==lines.length
      ||trailer[2]!==null&&!object(trailer[2]))fail('Missing or invalid replay trailer');
    const collector=capture(header.context);
    for(const line of lines){
      const row=JSON.parse(line);
      if(!Array.isArray(row)||!own(SCHEMA,row[0])||row.length!==6+SCHEMA[row[0]][1].length
        ||!Number.isInteger(row[2])||row[2]<0||row[2]>=phaseCodes.length)fail('Invalid event row');
      const [code,turn,phase,actor,source,audience,...payload]=row;
      const [type,fields]=SCHEMA[code];
      collector.receive({type,turn,phase:phaseCodes[phase],actor,source,audience,data:Object.fromEntries(fields.map((key,i)=>[key,mapStrings(payload[i],unpack)]))});
    }
    return {context:collector.context,replay:header.replay,events:collector.events(),current:trailer[2]};
  }

  function importArchive(v1,context){
    if(v1.format!=='UVS detailed replay'||v1.version!==1)fail('Unsupported archived replay format');
    let previous=v1.replay.initial;
    const diagnostics=[];
    const events=v1.observation.events.map((entry,index)=>{
      const {sequence,turn,phase,kind,state,before,diagnostics:trace,...data}=entry;
      if(sequence!==index)fail('Archived event sequence is not contiguous');
      if(trace!==undefined)diagnostics.push({event:index,trace});
      const event={type:'legacy-observation',turn,phase,actor:entry.player??null,source:null,
        data:{kind,data,delta:delta(previous,state),beforeDelta:before===undefined?null:[delta(state,before)]}};
      previous=state;
      return event;
    });
    return {text:encode(context,v1.replay,events,v1.observation.current),diagnostics};
  }
  function expandArchive(decoded,diagnostics=[]){
    const traces=new Map(diagnostics.map(({event,trace})=>[event,trace]));
    let state=decoded.replay.initial;
    return decoded.events.map((event,sequence)=>{
      if(event.type!=='legacy-observation')fail('Not an archived event sequence');
      state=restore(state,event.data.delta);
      const expanded={sequence,turn:event.turn,phase:event.phase,kind:event.data.kind,...event.data.data,state};
      if(event.data.beforeDelta!==null)expanded.before=restore(state,event.data.beforeDelta[0]);
      if(traces.has(sequence))expanded.diagnostics=traces.get(sequence);
      return expanded;
    });
  }

  function assertCompatible(context,installed){
    for(const field of ['ruleVersion','gameVersion','cardVersion','implementation','rng','decks','ai','parameters','formulas','solver','cards']){
      if(!own(installed,field)||!own(context,field)||!equal(installed[field],context[field]))
        fail('Replay compatibility mismatch: '+field);
    }
  }
  // The engine adapter must validate and replay into an isolated session before returning it.
  // This helper has no access to the live game until the caller commits a prepared session.
  async function load(text,{installed,parseLegacy,prepare,commit}){
    const first=text.trimStart();
    let replay;
    if(first.startsWith('{')){
      const decoded=decode(text);
      assertCompatible(decoded.context,installed);
      replay={kind:'compact',...decoded};
    }else{
      if(!/^#UVS v1\.9 replay\r?$/m.test(text))fail('Expected a compact replay or a legacy v1.9 replay');
      replay={kind:'legacy',replay:await parseLegacy(text)};
    }
    const prepared=await prepare(replay);
    return commit(prepared);
  }
  const api={FORMAT,VERSION,SCHEMA:freeze(SCHEMA),capture,encode,decode,importArchive,expandArchive,assertCompatible,load};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.UVSStructuredReplay=Object.freeze(api);
})(globalThis);
