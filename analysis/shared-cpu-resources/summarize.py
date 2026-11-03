import json,math,statistics as st
from pathlib import Path
from collections import Counter
B=Path(__file__).resolve().parent
D=['飛鳥・連撃','柳生・射撃','斑鳩・対抗封じ','葛城・削り','雲雀・反撃']
def rate(k,n):
 if not n:return {'wins':k,'n':n,'pct':None,'ci95':None}
 z=1.959963984540054;p=k/n;den=1+z*z/n;mid=(p+z*z/(2*n))/den;r=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
 return {'wins':k,'n':n,'pct':100*p,'ci95':[max(0,100*(mid-r)),min(100,100*(mid+r))]}
def fmt(r):return f"{r['pct']:.1f}% [{r['ci95'][0]:.1f}–{r['ci95'][1]:.1f}]" if r['n'] else '—'
def wr(rows):return rate(sum(g['winner']==i for g,i in rows),len(rows))
def delta(a,b):
 vals=[int(y)-int(x) for x,y in zip(a,b)];v=100*st.mean(vals);se=100*st.stdev(vals)/math.sqrt(len(vals))
 return {'pp':v,'ci95':[v-1.959963984540054*se,v+1.959963984540054*se],'changed':sum(x!=y for x,y in zip(a,b))}
def deckstats(rows):
 n=len(rows);p=[g['players'][i] for g,i in rows]
 total={k:sum(x[k] for x in p) for k in ['draw','attacks','hits','incoming','defensePlayed','defenseWins','heavyCards','chainHits','noUsableAttack','emptyHandAttackSkip','declinedLegalAttack','greenScrollUses']}
 ownturns=sum(g['turn']//2+int(g['turn']%2 and g['first']==i) for g,i in rows)
 return {'win':wr(rows),'drawMean':total['draw']/n,'turnMean':st.mean(g['turn'] for g,i in rows),
  'deckout':rate(sum(g['winner']!=i and g['reason']=='ドロー時に山札切れ' for g,i in rows),n),
  'damageDeckout':rate(sum(g['winner']!=i and g['reason']=='山札残数以上のダメージ' for g,i in rows),n),
  'lossReasons':dict(Counter(g['reason'] for g,i in rows if g['winner']!=i)),
  'defenseRate':rate(total['defenseWins'],total['defensePlayed']),'allIncomingStopped':rate(total['defenseWins'],total['incoming']),
  'attackHitRate':rate(total['hits'],total['attacks']),
  'hitsPerOwnTurn':total['hits']/ownturns,'attacksPerOwnTurn':total['attacks']/ownturns,
  'emptySkipGameRate':rate(sum(x['emptyHandAttackSkip']>0 for x in p),n),
  'ownTurns':ownturns,'totals':total,'perGame':{k:v/n for k,v in total.items()},
  'seatP1':wr([(g,i) for g,i in rows if i==0]),'first':wr([(g,i) for g,i in rows if i==g['first']])}
def main():
 conditions={};manifests={}
 for name in ['A','B']:
  m=json.loads((B/f'{name}-manifest.json').read_text());assert m['completed']==10000 and not m['errors'];manifests[name]=m
  r=sorted([json.loads(s) for s in (B/f'{name}-games.jsonl').read_text().splitlines()],key=lambda g:(g['config'],g['game']))
  assert len(r)==10000 and len({g['seed'] for g in r})==10000
  assert Counter(g['config'] for g in r)==Counter({i:500 for i in range(20)})
  conditions[name]=r
 for a,b in zip(conditions['A'],conditions['B']):assert all(a[k]==b[k] for k in ['seed','config','game','first','decks'])
 decks={};matrices={};global_stats={};focused={}
 for name,rows in conditions.items():
  bydeck={d:[(g,i) for g in rows for i in (0,1) if g['decks'][i]==d] for d in D}
  decks[name]={d:deckstats(rr) for d,rr in bydeck.items()}
  matrices[name]={a:{b:wr([(g,i) for g,i in bydeck[a] if g['decks'][1-i]==b]) if a!=b else rate(0,0) for b in D} for a in D}
  global_stats[name]={'games':len(rows),'meanTurn':st.mean(g['turn'] for g in rows),'medianTurn':st.median(g['turn'] for g in rows),
   'drawTotal':sum(sum(p['draw'] for p in g['players']) for g in rows),'lossReasons':dict(Counter(g['reason'] for g in rows)),
   'firstWin':rate(sum(g['winner']==g['first'] for g in rows),len(rows)),
   'P1Win':rate(sum(g['winner']==0 for g in rows),len(rows))}
  focused[name]={d:deckstats([(g,i) for g,i in bydeck[d] if g['decks'][1-i]=='葛城・削り']) for d in ['柳生・射撃','雲雀・反撃']}
 pairs=[]
 for i,a in enumerate(D):
  for b in D[i+1:]:
   flags={}
   for name,rows in conditions.items():flags[name]=[g['winner']==g['decks'].index(a) for g in rows if a in g['decks'] and b in g['decks']]
   pairs.append({'a':a,'b':b,'A':matrices['A'][a][b],'B':matrices['B'][a][b],'delta':delta(flags['A'],flags['B'])})
 deltas={}
 for d in D:
  f={name:[g['winner']==g['decks'].index(d) for g in rows if d in g['decks']] for name,rows in conditions.items()};deltas[d]=delta(f['A'],f['B'])
 refactor=json.loads((B/'refactor-validation.json').read_text());assert refactor['completed']==2000 and not refactor['errors']
 cache=json.loads((B/'cache-validation.json').read_text());assert not cache['errors'] and cache['uniqueMatchedSeeds']==1180
 result={'baselineCommit':manifests['A']['baseline'],'refactorCommit':'6803bcb8083777e825159b680f6ad5e0cedc18e7','behaviorCommit':'4207462','performanceCommit':'db83b6ed0c7dcd39a97f2783a780e71cd199cccf','cacheEquivalence':cache,'manifests':manifests,
  'refactor':refactor,'global':global_stats,'decks':decks,'matrices':matrices,'pairs':pairs,'deckDeltas':deltas,'focused':focused}
 (B/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 lines=[]
 def out(s=''):lines.append(s)
 out('# UVS CPU共通資源管理：実装とA/B検証');out()
 out('## 1. 対象・段階分離');out()
 out('基準mainはd757ca80709711ad9564898c39902f0fe001c411。30枚固定デッキ5種、ルールv2、既定ソルバー24サンプル・120反復で比較した。カード効果・数値・枚数・ルール・CSSは変更していない。公開反映とmainへのマージは行っていない。')
 out();out('- 第1段階6803bcb: 共通資源パラメータと評価関数の抽出のみ。全20配置各100seedの2,000試合で全操作・勝者・理由・ターン・最終状態が元mainと一致。旧AIも40試合で一致。共通操作列をgzipで保存。')
 out('- 第2段階4207462: 共通資源評価を全5デッキへ適用。相手の非公開配列を使わない公開情報サンプリングもこのコミットへ分離。')
 out('- 計算キャッシュdb83b6e: 判断中に不変な札の合法性/役割・公開未知プール・仮想手札の選択肢を再利用。候補や反復を省略しない。キャッシュ前Bの完了1,000件＋予備200件（重複除外1,180seed）と、全操作SHA256・決着・最終状態・全計測値が一致した。')
 out('- A: 現行CPU同士10,000試合。B: 新CPU同士10,000試合。各10対面×両座席×500試合、各配置で先攻P1/P2を250試合ずつ。同一seed系列を対応付けた。B予備200試合も異常なし。予備とリファクタリング検証は本集計へ加算しない。')
 out();out('**解釈の制約**: Bには公開情報サンプリング修正も含まれるため、差は資源評価だけの因果効果ではない。またA/A対B/Bであり、BがAより絶対的に強いという証明ではない。全デッキ合計の勝率は定義上50%なので、デッキ別・対面別と攻防指標を確認する。')
 out();out('**採用判断: 現在の初期係数によるBは採用非推奨。** 全体の山札切れ敗北は2,692→3,282件へ増え、成功攻撃/自分手番は全5デッキで減少。特に雲雀の対葛城勝率は23.2%→10.4%へ悪化した。共通化・公開情報制約の実装は完了したが、期待した資源管理改善を実測で確認できていない。結果を見て係数を後付け調整せず、失敗した初期案として保存する。')
 out();out('## 2. 全体の実測');out()
 out('|条件|試合数|平均/中央値ターン|総実ドロー（初手含む）|ドロー時山札切れ敗北|山札残数以上ダメージ敗北|先攻勝率 [95%CI]|');out('|---|---|---|---|---|---|---|')
 for name,s in global_stats.items():out(f"|{name}|{s['games']}|{s['meanTurn']:.2f} / {s['medianTurn']:g}|{s['drawTotal']:,}|{s['lossReasons'].get('ドロー時に山札切れ',0)}|{s['lossReasons'].get('山札残数以上のダメージ',0)}|{fmt(s['firstWin'])}|")
 out();out('勝率・敗北率の95%CIはWilson法。対応あり勝率差は各seedの勝敗差（−1/0/+1）の標準誤差を使った正規近似で、多重比較補正なし。デッキ総合は4対面を等重みで混合した記述統計。防御/攻撃のイベント率は同一試合内の依存を補正していない。')
 out();out('## 3. デッキ別勝率・ドロー・山札切れ');out()
 out('|デッキ|A勝率 [95%CI]|B勝率 [95%CI]|A→B実ドロー/出場|A→B山札切れ敗北率 [95%CI]|A→B平均ターン|');out('|---|---|---|---|---|---|')
 for d in D:
  a=decks['A'][d];b=decks['B'][d];out(f"|{d}|{fmt(a['win'])}|{fmt(b['win'])}|{a['drawMean']:.2f} → {b['drawMean']:.2f}|{fmt(a['deckout'])} → {fmt(b['deckout'])}|{a['turnMean']:.2f} → {b['turnMean']:.2f}|")
 out();out('各デッキ・条件4,000出場。実ドローは実draw関数の返値で計測し、初期手札4枚を含む。山札破壊・使用コスト・ダメージ移動・戻しをドローへ加算していない。山札切れは「ドロー時に山札切れ」で、ダメージによる山札枯渇は別集計。')
 out();out('## 4. 全10対面');out()
 out('左側デッキの勝率。各条件・対面1,000試合（両座席合算）。');out()
 out('|左側|相手|A [95%CI]|B [95%CI]|差 B−A [対応あり95%区間] ポイント|');out('|---|---|---|---|---|')
 for s in pairs:
  v=s['delta'];out(f"|{s['a']}|{s['b']}|{fmt(s['A'])}|{fmt(s['B'])}|{v['pp']:+.1f} [{v['ci95'][0]:+.1f}, {v['ci95'][1]:+.1f}]|")
 out();out('5×5の両マトリクス、座席P1・先攻別勝率、各デッキの対応あり差はsummary.jsonに保存。ミラー戦は対象外。')
 out();out('## 5. 攻防能力と手札不足');out()
 out('|デッキ|A→B攻撃/自分手番|A→B成功攻撃/自分手番|A→B全被攻撃阻止率 [95%CI]|A→B提出時防御成功率 [95%CI]|');out('|---|---|---|---|---|')
 for d in D:
  a=decks['A'][d];b=decks['B'][d];out(f"|{d}|{a['attacksPerOwnTurn']:.3f} → {b['attacksPerOwnTurn']:.3f}|{a['hitsPerOwnTurn']:.3f} → {b['hitsPerOwnTurn']:.3f}|{fmt(a['allIncomingStopped'])} → {fmt(b['allIncomingStopped'])}|{fmt(a['defenseRate'])} → {fmt(b['defenseRate'])}|")
 out();out('|デッキ|A→B攻撃可能札なし 件数（出場平均）|A→Bうち手札0枚 件数|A→B自発的見送り 件数|A→B重撃枚数/出場|A→B巻物使用/出場|');out('|---|---|---|---|---|---|')
 for d in D:
  a=decks['A'][d]['perGame'];b=decks['B'][d]['perGame'];ta=decks['A'][d]['totals'];tb=decks['B'][d]['totals']
  out(f"|{d}|{ta['noUsableAttack']} ({a['noUsableAttack']:.3f}) → {tb['noUsableAttack']} ({b['noUsableAttack']:.3f})|{ta['emptyHandAttackSkip']} → {tb['emptyHandAttackSkip']}|{ta['declinedLegalAttack']} → {tb['declinedLegalAttack']}|{a['heavyCards']:.3f} → {b['heavyCards']:.3f}|{a['greenScrollUses']:.3f} → {b['greenScrollUses']:.3f}|")
 out();out('「攻撃可能札なし」は元エンジンnoatkイベントで、手札0・GP不足等を含む。「うち手札0枚」はその厳密な部分集合で、純粋な枚数不足を示す。「自発的見送り」はダメージを与える合法攻撃候補があったがCPUがnullを返した回数。この3つを混同しない。追加連撃で使用可能札がなく終了する専用分岐はnoatkに含まない。')
 out();out('攻防上の観測（時間当たりに近い比較として自分手番で正規化）:');out()
 for d in D:
  a=decks['A'][d];b=decks['B'][d];attack='減少' if b['hitsPerOwnTurn']<a['hitsPerOwnTurn'] else '増加';defense='低下' if b['allIncomingStopped']['pct']<a['allIncomingStopped']['pct'] else '上昇'
  out(f"- {d}: 成功攻撃/手番は{attack}（{a['hitsPerOwnTurn']:.3f}→{b['hitsPerOwnTurn']:.3f}）、全被攻撃阻止率は{defense}（{a['allIncomingStopped']['pct']:.1f}→{b['allIncomingStopped']['pct']:.1f}%）。山札切れの変化だけで改善と判断しない。対戦相手側もBへ変わっているため、各値は絶対的な戦闘能力の因果推定ではない。")
 out();out('## 6. 柳生対葛城・雲雀対葛城');out()
 out('|対象（相手は葛城）|条件|勝率 [95%CI]|山札切れ敗北率 [95%CI]|実ドロー/出場|成功攻撃/自分手番|全被攻撃阻止率 [95%CI]|手札0見送り/出場|');out('|---|---|---|---|---|---|---|---|')
 for d in ['柳生・射撃','雲雀・反撃']:
  for name in ['A','B']:
   s=focused[name][d];out(f"|{d}|{name}|{fmt(s['win'])}|{fmt(s['deckout'])}|{s['drawMean']:.2f}|{s['hitsPerOwnTurn']:.3f}|{fmt(s['allIncomingStopped'])}|{s['perGame']['emptyHandAttackSkip']:.3f}|")
 out();out('この2対面は各条件1,000試合。勝率・ドロー削減・山札切れ・攻防を同時に確認し、山札を温存する代わりに攻め手が落ちていないかを見る。各敗北理由の件数はsummary.jsonのfocusedに保存。')
 out();out('重点対面の判断: 柳生対葛城は山札切れ敗北が15.8%→12.0%へ減った一方、勝率51.0%→36.2%、成功攻撃/手番0.706→0.655、全被攻撃阻止率24.7%→24.1%となり、山札切れの減少だけで改善とは評価できない。雲雀対葛城は勝率・山札切れ・攻撃・防御のすべてが悪化しており、この初期案では反撃型の実戦上の有効性を維持できたとは言えない。カード/連撃等のルール経路が残っていることと、戦術が十分に機能することは区別する。')
 out();out('次の検証候補（未実施）: まず「元の評価＋公開情報サンプリングのみ」のC条件を追加し、Bとの差で資源評価の寄与を分離する。その上で共通の選択肢喪失ペナルティ・攻撃失敗/手札温存ペナルティを一つずつ比較する。長期化が削りを相対的に有利にした可能性は仮説であり、今回の対戦だけでは原因と断定しない。キャラ別例外を増やす前に共通係数とサンプリングの分離検証を優先する。')
 out();out('## 7. 実装・パラメータ');out()
 out('CPU_RESOURCESの共通defaultsと、雲雀の7係数差分へ統合。drawValue（追加ドロー利益と山札寿命コスト）、depletionCost（通常ドローと公開の削り圧力）、spendCost/options（消費後の攻防選択肢）、handUtility（既存GP/連撃評価＋共通ボーナス）を使う。Solver.makeSolver({resources:{horizonTurns:3,normalDrawCost:30}})で個別設定を上書き可能。')
 out();out('射撃・対抗封じ・削り等のカード/キャラ効果、連撃条件と評価経路は維持。雲雀の防御成功・決着時加点も戦術差として残す。全員へ同じ初期値を適用し、対面別例外や勝率を見てからの後付けパラメータ調整は行っていない。')
 out();out('削り圧力は公開の現キャラ能力・ゲージで使用可能な既知の破壊札・公開手札枚数から作るヒューリスティック。実際の相手手札や山札順を見ない。公開デッキ構成から公開済み札を差し引いて未知プールを再構成し、裏向き攻撃札も未知のまま扱う。')
 out();out('旧経験則AIは独自の攻防戦術を残し、巻物の採否と重撃に同じ資源関数を接続した。A/B大量検証は既定ソルバーが対象で、旧AIの性能改善は主張しない。')
 out();out('## 8. 検証・再現');out()
 out('- 定義比較: CONFIG・カード/キャラのデータと効果関数・デッキ構成・CSSが元mainと同一。')
 out('- 第1段階: 2,000試合＋旧AI40試合の全操作一致。実際の共通操作列、操作数とSHA256、勝敗を保存。')
 out('- 第2段階: 山札寿命、手札飽和、公開の削りリスク、消費後の選択肢、係数上書きの局面検査。相手手札/山札をlength以外読めないProxyと、裏向き札を読めないgetterで実際の攻撃/防御ソルバーを実行し通過。非公開カードの分配/順序を変えても同じ公開状態と乱数で同じ評価。')
 out('- A 10,000試合は以前の分析コミット6d79eb8の同一seedデータと勝敗・理由・ターン・最終状態が全件一致。')
 out('- B予備200、本検証10,000に異常・監視上限超過なし。操作数、実ドロー、決着、攻防イベント、攻撃見送りをJSONLに全件保存。')
 out('- 高負荷だったキャッシュ前Bは1,000件で意図的に中断し、pre-cache-*として性能等価性の参照にのみ使用。最終B 10,000件へ重複加算しない。キャッシュは各判断入口で破棄し、実戦とロールアウトで同じ元の合法性関数を使う。')
 out('- ローカル390×844ブラウザで開始・CPU手番・ログを確認、JavaScriptエラー0。iPhone実機は未検証。')
 out();out('```sh\nnode analysis/shared-cpu-resources/refactor-check.cjs\nnode analysis/shared-cpu-resources/test.cjs\nnode analysis/shared-cpu-resources/compare-run.cjs A\nnode analysis/shared-cpu-resources/compare-run.cjs pilot\nnode analysis/shared-cpu-resources/compare-run.cjs B\npython3 analysis/shared-cpu-resources/summarize.py\n```')
 out();out('Node 24以上、Python標準ライブラリ。結果ファイルは再実行前に退避する（上書き拒否）。baseline.html/refactor.html/candidate.htmlは各段階の検証用スナップショットであり、公開エントリではない。seedは1000000+config×10000+game、先攻はgame%2。各manifestとJSONLに入力・実測を記録。')
 out();out('## 9. 未検証・仮説');out()
 out('- 混合A/Bの直接対戦、対人戦、ミラー戦、35/40枚・無色カード環境、旧AIの大量比較、iPhone実機は未検証。')
 out('- 公開情報サンプリング修正と資源評価の要因分離はしていない。Bの結果を資源係数だけの因果効果と解釈しない。')
 out('- 公開の削り圧力や追加ドロー利益は評価上の仮説であり、将来のドロー/削りを正確に予言するものではない。強制ドロー全種類の将来連鎖を厳密に展開する実装ではない。')
 out('- 勝率低下や攻防のトレードオフがあっても、今回の結果に合わせた例外追加・追加調整はしていない。採用判断には混合対戦や係数・サンプリングの分離比較が必要。')
 (B/'REPORT.ja.md').write_text('\n'.join(lines)+'\n')
 print(json.dumps({'global':global_stats,'focused':focused},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
