'use strict';

(function(root){
  const zones={hand:'手札',deck:'山札',discard:'捨て札',gYo:'陽ゲージ',gIn:'陰ゲージ',
    damage:'ダメージエリア',charDeck:'キャラエリア',battle:'バトル場',supports:'サポート置き場'};
  const noDefense={
    'no-legal':'防御可能なカードがなかった',
    'human-pass':'防御できたが人間が選択しなかった',
    'cpu-pass':'防御できたがCPUが選択しなかった'
  };
  const player=i=>i===null?'': 'P'+(i+1);
  const abilityStatus={'used':'使用','declined':'使用を見送った','no-target':'対象なし',
    'ineligible':'発動条件を満たさない','available':'使用可能'};
  function format(context,events,{ended=false,viewer=null}={}){
    const cards=new Map(context.cards.map(c=>[c.uid,c.name]));
    const name=id=>cards.get(id)??'名称未記録';
    const names=ids=>'［'+ids.map(name).join('、')+'］';
    const cause=s=>!s?'': (s[0]==='card'?name(s[1]):s[1])+'で';
    const zone=z=>z?(z.player===null?'':player(z.player)+'の')+(zones[z.zone]??z.zone):'位置未記録';
    const sizes=state=>state.players.map((p,i)=>{
      const z=p.zones;
      return player(i)+' 手札'+z.hand.length+'・山札'+z.deck.length+'・捨て札'+z.discard.length
        +'・陽'+z.gYo.length+'・陰'+z.gIn.length+'・ダメージ'+z.damage.length+'・Lv'+p.level;
    }).join('／');
    const lines=ended?(context.archivePrelude??[]).slice():[];
    for(const e of events){
      const d=e.data,p=player(e.actor),prefix=p?p+'：':'',reason=cause(e.source);
      if(e.type==='legacy-observation'){
        if(d.kind!=='log'||typeof d.data.entry?.s!=='string')continue;
        const entry=d.data.entry;
        if(ended)lines.push(entry.s);
        else if(entry.visibility)lines.push(viewer===entry.visibility.owner?entry.s:entry.visibility.publicText);
        // Old records have no general visibility contract. Only expose their unlabelled text after the match.
        continue;
      }
      const visible=ended||e.audience==='public'||viewer!==null&&viewer===e.audience;
      if(!visible){
        if(e.type==='initial-hand')lines.push(prefix+'初期手札'+d.uids.length+'枚');
        if(e.type==='draw')lines.push(prefix+d.uids.length+'ドロー（手札'+d.handCount+'枚）');
        continue;
      }
      const part=items=>items.map(([label,value])=>label+(value>=0?'+':'')+value).join('、');
      let line;
      switch(e.type){
        case 'start': line='ゲーム開始（ルール'+context.ruleVersion+'、先攻 '+player(context.first)+'）';break;
        case 'initial-hand': line='初期手札'+d.uids.length+'枚'+names(d.uids);break;
        case 'draw': line=reason+d.uids.length+'ドロー'+names(d.uids)+'（手札'+d.handCount+'枚）';break;
        case 'mill': line=reason+'山札の上から'+d.uids.length+'枚を捨て札'+names(d.uids);break;
        case 'move': line=reason+names(d.uids)+'を'+zone(d.from)+'から'+zone(d.to)+'へ移動';break;
        case 'return': line=reason+names(d.uids)+'を'+zone(d.from)+'から山札へ戻した（'+d.placement+'）';break;
        case 'gauge': line=reason+names(d.uids)+'を'+zone(d.from)+'から'+zone(d.gauge)+'へ配置';break;
        case 'cost': line=reason+names(d.uids)+'を'+zone(d.from)+'からコストとして捨て札';break;
        case 'ability-opportunity': line=d.ability+'（Lv'+d.level+'）'+(abilityStatus[d.availability]??d.availability);break;
        case 'ability-result': line=d.ability+'（Lv'+d.level+'）'+(abilityStatus[d.result]??d.result)+(d.targets?.length?names(d.targets):'');break;
        case 'attack': line=(d.mode==='R'?'連撃で':'')+'「'+name(d.uid)+'」でアタック';break;
        case 'defense': line=d.uid===null?'ディフェンスなし（'+(noDefense[d.reason]??'理由未記録')+'）':'「'+name(d.uid)+'」でディフェンス';break;
        case 'heavy': line='重撃「'+name(d.uid)+'」（AT'+d.at+'／DF'+d.df+'）';break;
        case 'chain': line='連撃 '+(d.result==='used'?'を宣言':abilityStatus[d.result]??d.result)+(d.uid===null?'':'「'+name(d.uid)+'」');break;
        case 'battle-result': line='判定 AT'+d.at+'（'+part(d.atParts)+'）対DF'+d.df+'（'+part(d.dfParts)+'）、DP'+d.dp+'、'+d.result;break;
        case 'damage': line=reason+'ダメージ '+d.before+' → '+d.after;break;
        case 'level': line=reason+'Lv'+d.from+' → Lv'+d.to+'（AT'+d.at+'／DF'+d.df+'、ダメージ'+d.damage+'）';break;
        case 'turn-end': line='ターン'+e.turn+'終了 '+sizes(d.state);break;
        case 'end': line=player(d.winner)+'の勝利（'+d.reason+(d.loPlayer===null?'':'、LO側 '+player(d.loPlayer))+'） '+sizes(d.state);break;
        default: continue;
      }
      lines.push(prefix+line);
    }
    return lines.join('\n');
  }
  const api={format};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.UVSNormalLog=Object.freeze(api);
})(globalThis);
