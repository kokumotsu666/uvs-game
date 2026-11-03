import gzip,json,math,statistics as st
from pathlib import Path
from collections import Counter,defaultdict
B=Path(__file__).resolve().parent
K='葛城・削り';Y='柳生・射撃';H='雲雀・反撃'
CATS=['初期手札','ターン通常','緑の巻物','その他サポート','バトルカード','キャラクター能力','その他']
def rate(k,n):
 if not n:return {'count':k,'n':0,'pct':None,'ci95':None}
 z=1.959963984540054;p=k/n;den=1+z*z/n;mid=(p+z*z/(2*n))/den;r=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
 return {'count':k,'n':n,'pct':100*p,'ci95':[max(0,100*(mid-r)),min(100,100*(mid+r))]}
def rf(r):return f"{r['pct']:.1f}% [{r['ci95'][0]:.1f}–{r['ci95'][1]:.1f}]" if r['n'] else '—'
def avg(x):return st.mean(x) if x else None
def af(x,digits=2):return f'{x:.{digits}f}' if x is not None else '—'
def zero():return dict(calls=0,requested=0,actual=0,normal=0,neutral=0,returned=0)
def add(dest,src):
 for k in ['calls','requested','actual','normal','neutral']:dest[k]+=src.get(k,0)
def bucket(n):
 return '0' if n==0 else '1–3' if n<=3 else '4–6' if n<=6 else '7–10' if n<=10 else '11–15' if n<=15 else '16–20' if n<=20 else '21+'
def main():
 manifest=json.loads((B/'main-manifest.json').read_text());assert manifest['completed']==6000 and not manifest['errors'] and not manifest['unclassified']
 games=sorted([json.loads(s) for s in (B/'main-games.jsonl').read_text().splitlines()],key=lambda g:(g['size'],g['config'],g['game']))
 assert len(games)==6000 and all(g['referenceMatch'] for g in games)
 lookup={(g['size'],g['config'],g['game']):g for g in games};assert len(lookup)==6000
 groups={}
 def key(g,p):
  opponent=Y if Y in g['decks'] else H
  return opponent,g['size'],g['decks'][p]
 for g in games:
  for p in [0,1]:
   k=key(g,p)
   if k not in groups:groups[k]={'opponent':k[0],'size':k[1],'deck':k[2],'rows':[],
     'categories':{c:zero() for c in CATS},'sources':defaultdict(zero),'sourceCategory':{},'damageDistribution':Counter(),'beforeDeckDistribution':Counter(),'beforeDeckBins':Counter(),
     'eventActual':0,'eventCalls':0,'greenActual':0,'greenNeutral':0,'greenShortCalls':0,'greenZeroCalls':0,'greenEmptyingCalls':0,'greenLow6Calls':0}
   s=groups[k];s['rows'].append((g,p))
   for c,v in g['draws'][p]['byCategory'].items():add(s['categories'][c],v)
   for source,v in g['draws'][p]['bySource'].items():add(s['sources'][source],v)
   for move in g['nonDrawMoves']:
    if move['kind']=='return' and move['p']==p:
     if move.get('unclassified'):raise ValueError('unclassified return')
     s['categories'][move['category']]['returned']+=move['actual'];s['sources'][move['source']]['returned']+=move['actual']
 total_calls=0;total_actual=0;unknown=[];green_game_events=defaultdict(list)
 with gzip.open(B/'main-draws.jsonl.gz','rt') as f:
  for line in f:
   e=json.loads(line);g=lookup[(e['size'],e['config'],e['game'])];s=groups[key(g,e['p'])]
   assert e['seed']==g['seed'] and e['beforeDeck']==e['beforeNormal']+e['beforeNeutral']
   assert e['actual']==e['normalDrawn']+e['neutralDrawn'] and e['afterDeck']==e['beforeDeck']-e['actual']
   assert e['effectiveBeforeDeck']==e['beforeNormal']+e['effectiveBeforeNeutral']
   assert not e['virtual']
   if e.get('unclassified'):unknown.append(e)
   s['eventActual']+=e['actual'];s['eventCalls']+=1;s['sourceCategory'][e['source']]=e['category'];total_calls+=1;total_actual+=e['actual']
   if e['category']=='緑の巻物':
    assert e['requested']==e['damage']
    s['damageDistribution'][e['damage']]+=1;s['beforeDeckDistribution'][e['beforeDeck']]+=1;s['beforeDeckBins'][bucket(e['beforeDeck'])]+=1
    s['greenActual']+=e['actual'];s['greenNeutral']+=e['neutralDrawn'];s['greenShortCalls']+=e['actual']<e['requested'];s['greenZeroCalls']+=e['actual']==0
    s['greenEmptyingCalls']+=e['actual']>0 and e['afterDeck']==0;s['greenLow6Calls']+=e['beforeDeck']<=6
    green_game_events[(e['size'],e['config'],e['game'],e['p'])].append(e)
 assert total_calls==manifest['drawCalls'] and not unknown
 output=[]
 for k in sorted(groups,key=lambda x:([Y,H].index(x[0]),x[1],0 if x[2]==K else 1)):
  s=groups[k];rows=s.pop('rows');n=len(rows);assert n==1000
  cats=s['categories'];sources=s['sources'];total=sum(v['actual'] for v in cats.values());requested=sum(v['requested'] for v in cats.values())
  assert total==s['eventActual']==sum(v['actual'] for v in sources.values())==sum(g['draws'][p]['totalActual'] for g,p in rows)
  assert sum(v['calls'] for v in cats.values())==s['eventCalls']
  green=cats['緑の巻物'];assert green['actual']==s['greenActual'] and green['neutral']==s['greenNeutral']
  assert green['calls']==sum(g['players'][p]['greenScrollUses'] for g,p in rows)
  for v in list(cats.values())+list(sources.values()):v['netLibraryDecrease']=v['actual']-v['returned'];v['shareOfAllDrawPct']=100*v['actual']/total;v['actualPerGame']=v['actual']/n
  returns=sum(g['draws'][p]['returned'] for g,p in rows);assert returns==sum(v['returned'] for v in cats.values())
  card_total=sum(cats[c]['actual'] for c in ['緑の巻物','その他サポート','バトルカード'])
  cross=[]
  for use_bucket in ['0','1','2','3+']:
   rr=[(g,p) for g,p in rows if (str(g['players'][p]['greenScrollUses']) if g['players'][p]['greenScrollUses']<3 else '3+')==use_bucket]
   losses=sum(g['winner']!=p and g['reason']=='ドロー時に山札切れ' for g,p in rr)
   cross.append({'uses':use_bucket,'games':len(rr),'deckoutLoss':rate(losses,len(rr)),
     'notDeckoutLoss':len(rr)-losses,'meanTurn':avg([g['turn'] for g,p in rr]),
     'meanFinalDamage':avg([g['players'][p]['damage'] for g,p in rr]),
     'greenActualPerGame':avg([g['draws'][p]['byCategory'].get('緑の巻物',{}).get('actual',0) for g,p in rr])})
  loss_usage=[]
  for lost in [False,True]:
   rr=[(g,p) for g,p in rows if (g['winner']!=p and g['reason']=='ドロー時に山札切れ')==lost]
   gg=sum(g['draws'][p]['byCategory'].get('緑の巻物',{}).get('actual',0) for g,p in rr);tt=sum(g['draws'][p]['totalActual'] for g,p in rr)
   loss_usage.append({'deckoutLoss':lost,'games':len(rr),'meanTurn':avg([g['turn'] for g,p in rr]),'greenUsesPerGame':avg([g['players'][p]['greenScrollUses'] for g,p in rr]),'greenActual':gg,'allDrawActual':tt,'greenSharePct':100*gg/tt if tt else None})
  s.update({'games':n,'totalActual':total,'totalRequested':requested,'returned':returns,'netDrawDecrease':total-returns,
   'libraryBudget':{'initial':s['size']*n,'grossDraw':total,'returnToBottom':returns,
    'destruction':sum(g['players'][p]['destroyNormal']+g['players'][p]['destroyNeutral'] for g,p in rows),
    'usageCost':sum(g['players'][p]['costNormal']+g['players'][p]['costNeutral'] for g,p in rows),
    'damageMove':sum(g['draws'][p]['damageMoved'] for g,p in rows),'finalLibrary':sum(g['players'][p]['deck'] for g,p in rows)},
   'perGame':{'initial':cats['初期手札']['actual']/n,'turn':cats['ターン通常']['actual']/n,'abilityGross':cats['キャラクター能力']['actual']/n,'abilityNet':cats['キャラクター能力']['netLibraryDecrease']/n,'cardEffects':card_total/n,'green':green['actual']/n,'all':total/n},
   'green':{'uses':green['calls'],'actual':green['actual'],'requested':green['requested'],'actualPerUse':green['actual']/green['calls'] if green['calls'] else None,'shareOfAllDrawPct':100*green['actual']/total,'shareExcludingOpeningPct':100*green['actual']/(total-cats['初期手札']['actual']),
    'neutralDrawn':green['neutral'],'shortCalls':s['greenShortCalls'],'zeroCalls':s['greenZeroCalls'],'emptyingCalls':s['greenEmptyingCalls'],'beforeDeckAtMost6Calls':s['greenLow6Calls']},
   'deckoutLoss':rate(sum(g['winner']!=p and g['reason']=='ドロー時に山札切れ' for g,p in rows),n),
   'crossByUses':cross,'lossUsageSummary':loss_usage})
  output.append(s)
 result={'manifest':manifest,'drawCalls':total_calls,'actualDraws':total_actual,'unclassified':unknown,'groups':output}
 (B/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');(B/'unclassified-draws.json').write_text(json.dumps(unknown,ensure_ascii=False,indent=2)+'\n')
 lines=[]
 def out(t=''):lines.append(t)
 out('# UVS v1.5 ドロー発生源別の消費量調査');out()
 out('## 1. 対象・結論の範囲');out()
 out(f'PR #3の`fcbdf073e874501bef8594c23be21e5a74d4edc9`と同じseed・座席・先攻で6,000試合を再実行した。実ドロー呼出しは{total_calls:,}回、実際に手札へ引いた総枚数は{total_actual:,}枚。未分類0件、仮想対戦中の実ドロー0件、異常終了0件。全6,000件でPR #3の勝者・理由・ターン・最終状態・既存計測値が一致した。')
 out();out('主要な観測: 柳生の巻物は1試合約2.99–3.26枚（全ドローの12.2–12.6%）、雲雀は約2.15–4.04枚（8.5–13.3%）だった。柳生30枚では枯渇付近の使用と山札切れ敗北に関連がある一方、雲雀は山札6枚以下での巻物使用が全条件0回。巻物を一律に山札切れの主因とする根拠は得られていない。')
 out();out('巻物の実ドロー量と山札切れの関連は記述できるが、使用が敗北の原因だとは断定できない。「巻物を使用しなくても山札切れしたか」は、この計測だけでは分からない。使用しない分岐の対戦は実行していない。')
 out();out('## 2. 1試合あたりのドロー量');out()
 out('各行は1デッキの1,000出場。初期手札・通常ドロー・能力・カード効果は排他的分類。カード効果には緑の巻物・その他サポート・バトルカードを含む。能力の総ドローと、その能力による山札下への戻しを引いた純減量を併記する。');out()
 out('|対面の相手|枚数|対象|初手|通常|能力・総/純減|カード効果|うち緑の巻物|全ドロー|');out('|---|---|---|---|---|---|---|---|---|')
 for s in output:
  p=s['perGame'];out(f"|{s['opponent']}|{s['size']}|{s['deck']}|{p['initial']:.2f}|{p['turn']:.2f}|{p['abilityGross']:.2f} / {p['abilityNet']:.2f}|{p['cardEffects']:.2f}|{p['green']:.2f}|{p['all']:.2f}|")
 out();out('同じカードを山札下に戻して再度引いた場合も、実際のdraw呼出しで手札へ移った枚数を累積する。総ドロー枚数は初期山札サイズを超える場合があり、ユニークなカード枚数や山札の純減量ではない。')
 out();out('## 3. 緑の巻物の量・割合');out()
 out('割合は初期手札を含む全実ドロー合計を分母とした比率。初手除外の割合もsummary.jsonに保存。');out()
 out('|相手|枚数|対象|使用回数|実ドロー総数|1回平均|全ドロー比率|無色ドロー|要求不足/実0枚|使用直前山札6枚以下|');out('|---|---|---|---|---|---|---|---|---|---|')
 for s in output:
  v=s['green'];out(f"|{s['opponent']}|{s['size']}|{s['deck']}|{v['uses']}|{v['actual']}|{af(v['actualPerUse'])}|{v['shareOfAllDrawPct']:.1f}%|{v['neutralDrawn']}|{v['shortCalls']} / {v['zeroCalls']}|{v['beforeDeckAtMost6Calls']}|")
 out();out('要求枚数は実ドローと区別した。ログの「nドロー」は集計の根拠にしていない。巻物が最後のカードを引いた呼出し数はsummary.jsonのgreen.emptyingCallsに記録したが、それも巻物が敗北原因だという証明ではない。')
 out();out('## 4. 巻物使用時のダメージ・山札残数分布');out()
 out('使用回数の分布であり、試合数の分布ではない。山札残数は巻物の実draw関数を呼ぶ直前。');out()
 out('|相手|枚数|対象|ダメージ枚数→使用回数|山札0|1–3|4–6|7–10|11–15|16–20|21以上|');out('|---|---|---|---|---|---|---|---|---|---|---|')
 for s in output:
  dist=', '.join(f'{k}枚:{v}' for k,v in sorted(s['damageDistribution'].items()))
  out('|'+s['opponent']+'|'+str(s['size'])+'|'+s['deck']+'|'+dist+'|'+'|'.join(str(s['beforeDeckBins'].get(b,0)) for b in ['0','1–3','4–6','7–10','11–15','16–20','21+'])+'|')
 out();out('山札残数の整数ごとの完全な分布はsummary.jsonのbeforeDeckDistribution、ダメージ分布はdamageDistribution。各呼出しの通常/無色内訳・要求/実枚数はmain-draws.jsonl.gzに全件保存。')
 out();out('## 5. カード名・能力名ごとの山札消費への寄与');out()
 out('全件の発生源分類。戻し枚数は非ドロー操作として別計測し、同じ発生源の総ドローから引いた値を純減寄与とする。純減寄与はドロー/戻し収支であり、破壊・使用コスト・ダメージ移動は含まない。');out()
 out('|相手|枚数|対象|分類・発生源|呼出し|要求|実ドロー|戻し|純減寄与|全ドロー比率|');out('|---|---|---|---|---|---|---|---|---|---|')
 for s in output:
  for source,v in sorted(s['sources'].items()):out(f"|{s['opponent']}|{s['size']}|{s['deck']}|{s['sourceCategory'].get(source,'戻しのみ')}・{source}|{v['calls']}|{v['requested']}|{v['actual']}|{v['returned']}|{v['netLibraryDecrease']}|{v['shareOfAllDrawPct']:.1f}%|")
 out();out('牛乳で戻ったキャラの忍転身はキャラクター能力に分類し、親のサポート名を各イベントのparentSupportsに保存した。キャラ能力が赤の巻物などの処理中に発動しても、実際の直接発生源を優先し二重計上しない。その他のドロー（第7分類）は実測0件、未分類も0件だった。')
 out();out('山札全体の収支（1出場平均、破壊・コスト・ダメージ移動はドローに含めない）:');out()
 out('|相手|枚数|対象|全実ドロー|戻し|破壊|使用コスト|ダメージ移動|最終山札|');out('|---|---|---|---|---|---|---|---|---|')
 for s in output:
  b=s['libraryBudget'];assert b['initial']+b['returnToBottom']-b['grossDraw']-b['destruction']-b['usageCost']-b['damageMove']==b['finalLibrary']
  out('|'+s['opponent']+'|'+str(s['size'])+'|'+s['deck']+'|'+'|'.join(f"{b[k]/1000:.3f}" for k in ['grossDraw','returnToBottom','destruction','usageCost','damageMove','finalLibrary'])+'|')
 out();out('## 6. 山札切れ敗北と巻物使用状況のクロス集計');out()
 out('山札切れ敗北は「ドロー時に山札切れ」。山札残数以上のダメージ敗北は「山札切れ敗北なし」側に含める。表の率はWilson 95%CI。');out()
 out('|相手|枚数|対象|巻物使用回数|試合数|山札切れ敗北あり|なし|敗北率 [95%CI]|平均決着ターン|');out('|---|---|---|---|---|---|---|---|---|')
 for s in output:
  for c in s['crossByUses']:out(f"|{s['opponent']}|{s['size']}|{s['deck']}|{c['uses']}|{c['games']}|{c['deckoutLoss']['count']}|{c['notDeckoutLoss']}|{rf(c['deckoutLoss'])}|{af(c['meanTurn'])}|")
 out();out('敗北の有無で分けた使用量（対象デッキは柳生・雲雀）:');out()
 out('|対象|枚数|山札切れ敗北|試合数|平均ターン|平均巻物使用|巻物実ドロー合計|全実ドロー中の割合|');out('|---|---|---|---|---|---|---|---|')
 for s in output:
  if s['deck'] not in [Y,H]:continue
  for c in s['lossUsageSummary']:out(f"|{s['deck']}|{s['size']}|{'あり' if c['deckoutLoss'] else 'なし'}|{c['games']}|{af(c['meanTurn'])}|{af(c['greenUsesPerGame'])}|{c['greenActual']}|{af(c['greenSharePct'],1)}%|")
 out();out('## 7. 柳生・雲雀に関する重点分析');out()
 for deck in [Y,H]:
  out('### '+deck);out()
  for s in output:
   if s['deck']!=deck:continue
   c=s['categories'];v=s['green'];out(f"- {s['size']}枚: 巻物は1試合{v['actual']/1000:.3f}枚、全ドローの{v['shareOfAllDrawPct']:.1f}%。通常ドローは{c['ターン通常']['actual']/1000:.3f}枚、キャラ能力は総{c['キャラクター能力']['actual']/1000:.3f}枚／純減{c['キャラクター能力']['netLibraryDecrease']/1000:.3f}枚。山札切れ敗北は{rf(s['deckoutLoss'])}。")
  if deck==Y:
   out();out('柳生の能力には「2枚引いて1枚戻す」「戻した枚数だけ引く」が含まれる。Lv4/Lv5のスタンバイ入れ替えは全条件で純減0枚だった。30枚条件で能力の総ドロー4,126枚を純減と見なすと、戻し2,463枚分を過大計上する。巻物の2,987枚は戻しを伴わず、キャラ能力の純減1,663枚より大きい追加消費源だった。')
   out();out('30枚条件では巻物の要求3,169枚に対し実ドローは2,987枚で、82呼出しが要求未満、うち18呼出しは実0枚。ログの要求枚数を使う集計では182枚過大となる。使用直前の山札6枚以下も203回あり、雲雀と異なる枯渇付近の使用が観測された。')
   out();out('30枚条件にはドロー以外にも山札破壊2,869枚、リミットブレイクの使用コスト1,371枚の消費があった。これらを巻物ドローに混ぜず、山札全体の収支からリスクを評価する必要がある。')
   y30=next(s for s in output if s['deck']==Y and s['size']==30)
   out();out('30枚の使用回数別山札切れ敗北率は '+ '、'.join(f"{c['uses']}回: {rf(c['deckoutLoss'])}（{c['games']}試合）" for c in y30['crossByUses'] if c['games'])+'。使用が多い群で高い関連があるが、試合の長さも異なる。40枚の敗北は全体でも4件だけで、小標本の群比較に注意する。')
  else:
   out();out('30枚条件のキャラ能力ドロー2,369枚の内訳はLv2忍転身1,845枚、防御時524枚だった。強制防御ドローだけが能力消費の中心ではなく、牛乳等による再登場も含むLv2忍転身の寄与が大きい。巻物2,152枚は、防御時ドローより大きい一方、通常ドロー16,916枚よりは小さい。')
   out();out('30枚条件で受けた山札破壊は2,889枚で、巻物ドロー2,152枚より多かった。ただし、この量の大小も各要因の勝敗に対する因果効果の比較ではない。')
   out();out('3条件を通じて、山札6枚以下での巻物使用・巻物での山札引き切り・要求未満の巻物ドローはすべて0回だった。現行雲雀CPUが枯渇目前にも巻物を使い続けている挙動は、この範囲では観測されなかった。ただし、以前に引いた分が将来の山札寿命を縮める可能性まで否定するものではない。')
   h30=next(s for s in output if s['deck']==H and s['size']==30);c=h30['crossByUses'][0]
   out();out(f"30枚条件では巻物使用0回でも{c['deckoutLoss']['count']}/{c['games']}試合が山札切れ敗北（{rf(c['deckoutLoss'])}）。また、30→35→40枚で巻物の実ドローは2,152→3,136→4,042枚へ増えた一方、山札切れ敗北は617→450→286件へ減った。巻物量だけで条件間の山札切れ頻度は説明できない。")
  out()
 out('クロス集計の使用回数と敗北率の関係には、ダメージ量、キャラレベル、防御回数、試合の長さ、相手の山札破壊、CPUの使用判断が交絡する。長い試合では巻物を使う機会も増える。表の関連を因果効果や「巻物を減らせば勝てる」という結論へ置き換えない。')
 out();out('## 8. 計測仕様・検証');out()
 out('- PR #3のruntime.cjs/playをそのまま呼び、PR #3のファイルおよびindex.htmlは変更していない。計測用VMだけでdrawの入口/出口を観測し、委譲先の返値・実際の手札増分・山札減分を照合する。カード/能力・AI・ルールを改変しない。')
 out('- VMの元スクリプトに固定の仮想ファイル名を与え、実ドロー呼出しスタックの直接の元ソース行から分類する。元コードの21ドロー呼出し行を静的検査し、実行時の未分類も検出する。合成した未分類呼出しを検出できることも単体検査した（本検証には含めない）。')
 out('- 各イベントに発生源、要求/実枚数、ドロー直前の山札残数・通常/無色内訳、引いた通常/無色枚数、ダメージ、ターン、呼出し位置、親サポート名を保存。0枚しか引けない呼出しも記録する。')
 out('- PR #3は初手配布後に無色を末尾へ追加する実装。初期手札イベントのbeforeDeck/Normal/Neutralは実配列の値（通常30・無色0）で、pendingInitialNeutralに未挿入の末尾分、effectiveBeforeDeck/Neutralに論理的な35/40枚構成での残数も併記する。初手の実ドローは3条件すべて通常4枚。')
 out('- 山札下への戻し、millによる破壊、リミットブレイク使用コスト、ダメージ移動はドローに加算しない。仮想対戦のスタックで実ドローが検出されれば異常として停止する。')
 out('- 全試合で「初期枚数＋山札下への戻し−全実ドロー−破壊/使用コスト−ダメージ移動＝最終山札」を独立に検算。発生源/分類別合計と全実ドローの一致、無色ドローのPR #3一致、無色の枚数保存も確認した。')
 out('- PR #3全6,000件と勝敗・理由・ターン・最終状態・既存指標が一致。30枚2,000件はさらに前回30枚シミュレーターの照合も通過。予備120件と全12配置の代表seed検査も実施した。')
 out();out('## 9. 再現方法・未検証項目');out()
 out('```sh\nnode analysis/draw-source-consumption/test.cjs\nnode analysis/draw-source-consumption/run.cjs pilot\nnode analysis/draw-source-consumption/run.cjs main\npython3 analysis/draw-source-consumption/summarize.py\n```')
 out();out('Node 24以上、Python標準ライブラリ。既存結果は上書きを拒否するため、再実行前に退避する。rawドローは連結gzipメンバーのJSONLで、Python gzip.openなどで全件読み出せる。各試合のseed/座席/先攻はゲームJSONLとPR #3の仕様に一致する。')
 out();out('- 巻物を使わない反実仮想、使用回数を減らしたCPU、カード数値変更、対人戦・他対面は検証していない。')
 out('- 今回使われなかったドロー発生源は呼出し位置の静的確認のみで、全カード効果の全到達局面を網羅実行していない。未分類が0なのはこの6,000試合の範囲。')
 out('- クロス集計の率は記述的なWilson区間。多重比較補正・試合時間やダメージ等を調整した因果推定は行っていない。')
 (B/'REPORT.ja.md').write_text('\n'.join(lines)+'\n')
 print(json.dumps({'games':len(games),'drawCalls':total_calls,'actualDraws':total_actual,'unclassified':len(unknown),'focus':[{'deck':s['deck'],'size':s['size'],'green':s['green'],'ability':s['categories']['キャラクター能力'],'deckout':s['deckoutLoss']} for s in output if s['deck'] in [Y,H]]},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
