// Passive interception only; PR #3's runtime and production file are not edited.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const baseline=require('../deck-size-colorless/runtime.cjs');
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1].replace(/startScreen\(\);\s*$/,''));
const scriptIndex=new Map(scripts.map((s,i)=>[s,i]));
const CATEGORIES=['初期手札','ターン通常','緑の巻物','その他サポート','バトルカード','キャラクター能力','その他'];
function classify(site,p){
 const line=scripts[site.script]?.split('\n')[site.line-1]||'';
 const top=p.charDeck?.[0];
 if(line.includes('draw(p,CONFIG.startHand)'))return ['初期手札','初期手札'];
 if(line.includes('CONFIG.firstTurnDraw:CONFIG.drawPerTurn'))return ['ターン通常','ターン開始ドロー'];
 if(line.includes('病院の待合室にての効果で1ドロー'))return ['その他サポート','病院の待合室にて:解除時'];
 if(line.includes('p.turnMod.winDraw'))return ['その他サポート','じっちゃんの太巻き:勝利時'];
 const support=line.match(/S\('([^']+)'/);
 if(support)return [support[1]==='緑の巻物'?'緑の巻物':'その他サポート',support[1]+':use'];
 const battle=line.match(/B\('([^']+)'/);
 if(battle)return ['バトルカード',battle[1]+':onWin'];
 if(line.includes('const draw2bottom1=')){
  if(top?.lv===2)return ['キャラクター能力','柳生Lv2:忍転身(onTop)'];
  if(top?.lv===5)return ['キャラクター能力','柳生Lv4:破れ2(onDamaged)'];
  return ['その他','未分類:draw2bottom1のキャラ状態'];
 }
 if(line.includes('const swapN='))return ['キャラクター能力',p.charName+'Lv'+top?.lv+':スタンバイ入れ替え'];
 if(line.includes('const D1='))return ['キャラクター能力',p.charName+'Lv'+top?.lv+':忍転身(onTop)'];
 if(line.includes('onGuard:async'))return ['キャラクター能力','雲雀Lv4:防御時(onGuard)'];
 const char=line.match(/name:'([^']+)',lv:(\d+)/);
 if(char&&line.includes('draw('))return ['キャラクター能力',char[1]+'Lv'+char[2]+':'+(line.includes('onDamaged:')?'onDamaged':line.includes('standby:')?'スタンバイ':'onTop')];
 if(line.includes('onTop:async')&&line.includes('draw('))return ['キャラクター能力',p.charName+'Lv'+top?.lv+':登場時(onTop)'];
 return ['その他','未分類:呼出し元'];
}
function meteredEngine(){
 const original=vm.runInContext;let installed=false;
 vm.runInContext=function(code,context,options){
  const index=scriptIndex.get(code);
  const result=original.call(vm,code,context,{...options,...(index!==undefined?{filename:'uvs-production-'+index+'.js'}:{})});
  if(code.includes('globalThis.EXP={players:[],calls:[]}')){
   context.__drawMetadata=(p,n,stack,turn,phase)=>{
    const matches=[...stack.matchAll(/uvs-production-(\d+)\.js:(\d+):(\d+)/g)];
    const a=matches[0],site=a?{script:+a[1],line:+a[2],column:+a[3]}:{script:-1,line:-1,column:-1};
    const [category,source]=classify(site,p);
    const parentSupports=[...new Set(matches.slice(1).map(a=>(scripts[+a[1]]?.split('\n')[+a[2]-1]||'').match(/S\('([^']+)'/)?.[1]).filter(Boolean))];
    const virtual=/\bat (?:evalBattle|solveAttack|solveDefend)\b/.test(stack);
    return {p:p.idx,deck:p.deckKey,category,source,requested:n,turn,phase:phase||null,damage:p.damage.length,site,parentSupports,virtual,
     ...(source.startsWith('未分類')?{unclassified:true,stack}:{} )};
   };
   original.call(vm,`globalThis.DRAWOBS={size:30,events:[],moves:[]};
    globalThis.resetDrawObserver=size=>{DRAWOBS={size,events:[],moves:[]};};
    (()=>{const delegate=draw;draw=function(p,n){
      const event=__drawMetadata(p,n,new Error().stack,G.turn,G.phase);
      event.seq=DRAWOBS.events.length;
      event.beforeDeck=p.deck.length;event.beforeNeutral=p.deck.filter(c=>c.experimentalNeutral).length;
      event.beforeNormal=event.beforeDeck-event.beforeNeutral;
      event.pendingInitialNeutral=event.category==='初期手札'?DRAWOBS.size-30:0;
      event.effectiveBeforeDeck=event.beforeDeck+event.pendingInitialNeutral;
      event.effectiveBeforeNeutral=event.beforeNeutral+event.pendingInitialNeutral;
      const handBefore=p.hand.length;const result=delegate.call(this,p,n);
      const actualCards=p.hand.slice(handBefore);
      event.actual=result;event.normalDrawn=actualCards.filter(c=>!c.experimentalNeutral).length;
      event.neutralDrawn=actualCards.length-event.normalDrawn;event.afterDeck=p.deck.length;
      if(result!==actualCards.length||event.beforeDeck-event.afterDeck!==result)throw Error('draw accounting mismatch');
      DRAWOBS.events.push(event);return result;
    };})();
    (()=>{const delegate=toBottom;toBottom=function(p,cards,why){
      const event=__drawMetadata(p,cards.length,new Error().stack,G.turn,G.phase);
      const before=p.deck.length;const result=delegate.call(this,p,cards,why);
      DRAWOBS.moves.push({...event,kind:'return',actual:p.deck.length-before,beforeDeck:before,afterDeck:p.deck.length,why});return result;
    };})();
    (()=>{const delegate=applyDamage;applyDamage=async function(p,n,why){
      const before=new Set(p.damage.map(c=>c.uid));
      try{return await delegate.call(this,p,n,why);}finally{
        const moved=p.damage.filter(c=>c.type!=='char'&&!before.has(c.uid));
        if(moved.length)DRAWOBS.moves.push({kind:'damageMove',p:p.idx,deck:p.deckKey,turn:G.turn,why,actual:moved.length,neutral:moved.filter(c=>c.experimentalNeutral).length});
      }
    };})();`,context,{filename:'draw-observer-install.js'});
   installed=true;
  }
  return result;
 };
 let e;try{e=baseline.engine();}finally{vm.runInContext=original;}
 if(!installed)throw Error('PR3 draw interceptor was not found');
 return e;
}
const references=new Map(fs.readFileSync(path.resolve(__dirname,'../deck-size-colorless/main-games.jsonl'),'utf8').trim().split('\n').map(s=>{const g=JSON.parse(s);return [[g.size,g.config,g.game].join(':'),g]}));
async function measure(e,input){
 e.run('resetDrawObserver('+input.size+')');
 const game=await baseline.play(e,input);
 const events=JSON.parse(e.run('JSON.stringify(DRAWOBS.events)'));
 const moves=JSON.parse(e.run('JSON.stringify(DRAWOBS.moves)'));
 const ref=references.get([game.size,game.config,game.game].join(':'));if(!ref)throw Error('missing PR3 reference');
 const compareKeys=['winner','reason','turn','players','hibariCounterWin','katsuragiWin','millSources'];
 if(!compareKeys.every(k=>JSON.stringify(game[k])===JSON.stringify(ref[k])))throw Error('PR3 outcome/state mismatch '+JSON.stringify(input));
 if(events.some(x=>x.virtual))throw Error('unexpected real draw in virtual battle');
 const byPlayer=[0,1].map(i=>{
  const ev=events.filter(x=>x.p===i),byCategory={},bySource={};
  for(const x of ev){for(const [target,key] of [[byCategory,x.category],[bySource,x.source]]){
   const v=target[key]||(target[key]={calls:0,requested:0,actual:0,normal:0,neutral:0});
   v.calls++;v.requested+=x.requested;v.actual+=x.actual;v.normal+=x.normalDrawn;v.neutral+=x.neutralDrawn;
  }}
  const total=ev.reduce((n,x)=>n+x.actual,0);
  if(Object.values(byCategory).reduce((n,x)=>n+x.actual,0)!==total||Object.values(bySource).reduce((n,x)=>n+x.actual,0)!==total)throw Error('source sum mismatch');
  if(ev.reduce((n,x)=>n+x.neutralDrawn,0)!==game.players[i].drawNeutral)throw Error('PR3 neutral draw mismatch');
  if((byCategory['緑の巻物']?.calls||0)!==game.players[i].greenScrollUses)throw Error('scroll-use count mismatch');
  const returned=moves.filter(x=>x.p===i&&x.kind==='return').reduce((n,x)=>n+x.actual,0);
  const damageMoved=moves.filter(x=>x.p===i&&x.kind==='damageMove').reduce((n,x)=>n+x.actual,0);
  const pp=game.players[i],milled=pp.destroyNeutral+pp.destroyNormal+pp.costNeutral+pp.costNormal;
  if(input.size+returned-total-milled-damageMoved!==pp.deck)throw Error('independent library balance mismatch');
  return {totalActual:total,totalRequested:ev.reduce((n,x)=>n+x.requested,0),calls:ev.length,returned,damageMoved,milled,byCategory,bySource};
 });
 return {game:{...game,referenceMatch:true,draws:byPlayer,unclassified:events.filter(x=>x.unclassified).length,nonDrawMoves:moves},events};
}
module.exports={meteredEngine,measure,classify,scripts,CATEGORIES};
