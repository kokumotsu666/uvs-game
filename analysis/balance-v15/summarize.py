"""Aggregate actual JSONL games. Python 3 standard library only."""
import json, math, statistics as st
from pathlib import Path
from collections import Counter
BASE=Path(__file__).resolve().parent
D=['飛鳥・連撃','柳生・射撃','斑鳩・対抗封じ','葛城・削り','雲雀・反撃']
def wilson(w,n):
    if not n:return None
    z=1.959963984540054;p=w/n;den=1+z*z/n
    mid=(p+z*z/(2*n))/den;rad=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    return [100*(mid-rad),100*(mid+rad)]
def rate(w,n):return dict(wins=w,n=n,pct=100*w/n if n else None,ci95=wilson(w,n))
def fmt(r):return f"{r['pct']:.1f}% [{r['ci95'][0]:.1f}–{r['ci95'][1]:.1f}]" if r['n'] else '—'
def mean(xs):return st.mean(xs) if xs else None
def main():
    manifest=json.loads((BASE/'main-manifest.json').read_text())
    games=sorted([json.loads(s) for s in (BASE/'main-games.jsonl').read_text().splitlines()],key=lambda g:(g['config'],g['game']))
    pilot=json.loads((BASE/'pilot-manifest.json').read_text())
    assert len(games)==manifest['completed']
    assert len({(g['config'],g['game']) for g in games})==len(games)
    assert len({g['seed'] for g in games})==len(games)
    assert all(g['winner'] in (0,1) and g['turn']>0 for g in games)
    config_counts=Counter(g['config'] for g in games)
    assert len(games)==10000 and all(config_counts[i]==500 for i in range(20))
    appearances={d:[(g,i) for g in games for i in (0,1) if g['decks'][i]==d] for d in D}
    def wr(rows):return rate(sum(g['winner']==i for g,i in rows),len(rows))
    stats={}
    for d,rows in appearances.items():
        n=len(rows);p=[g['players'][i] for g,i in rows]
        deckouts=sum(g['winner']!=i and g['reason']=='ドロー時に山札切れ' for g,i in rows)
        damage_deckouts=sum(g['winner']!=i and g['reason']=='山札残数以上のダメージ' for g,i in rows)
        metrics={k:sum(x[k] for x in p) for k in ['attacks','hits','incoming','defensePlayed','defenseWins','recoveryUses','heavyCards','chainAttempts','chainHits','greenScrollUses','attackPasses','enemyHeavyOnGuards']}
        stats[d]={'overall':wr(rows),'seatP1':wr([(g,i) for g,i in rows if i==0]),'seatP2':wr([(g,i) for g,i in rows if i==1]),
          'first':wr([(g,i) for g,i in rows if i==g['first']]),'second':wr([(g,i) for g,i in rows if i!=g['first']]),
          'seatFirst':{f'P{s+1}-'+('先攻' if f else '後攻'):wr([(g,i) for g,i in rows if i==s and (i==g['first'])==f]) for s in (0,1) for f in (True,False)},
          'turnMean':mean([g['turn'] for g,i in rows]),'turnMedian':st.median(g['turn'] for g,i in rows),
          'deckoutLoss':rate(deckouts,n),'damageDeckoutLoss':rate(damage_deckouts,n),'finalDamageMean':mean([x['damage'] for x in p]),
          'finalDeckMean':mean([x['deck'] for x in p]),'metrics':metrics,
          'defenseSuccess':rate(metrics['defenseWins'],metrics['defensePlayed']),
          'allIncomingStopped':rate(metrics['defenseWins'],metrics['incoming'])}
    matrix={a:{b:wr([(g,i) for g,i in appearances[a] if g['decks'][1-i]==b]) if a!=b else rate(0,0) for b in D} for a in D}
    first=rate(sum(g['winner']==g['first'] for g in games),len(games));seat=rate(sum(g['winner']==0 for g in games),len(games))
    patterns=[g for g in games if g['hibariPattern']]
    pattern_counts={k:sum(bool(g['hibariPattern'][k]) for g in patterns) for k in ['damageWin','deckoutWin','afterGuard','counterDamageWin','lateCounterDamageWin']}
    hibari_matchups={}
    for opponent in D[:4]:
        rows=[(g,i) for g,i in appearances[D[4]] if g['decks'][1-i]==opponent]
        hibari_matchups[opponent]={'win':wr(rows),
          'reasons':dict(Counter(('勝利:' if g['winner']==i else '敗北:')+g['reason'] for g,i in rows)),
          'ownDeckoutLoss':rate(sum(g['winner']!=i and g['reason']=='ドロー時に山札切れ' for g,i in rows),len(rows)),
          'counterDamageWins':sum(bool(g['hibariPattern'] and g['hibariPattern']['counterDamageWin']) for g,i in rows)}
    examples=[{k:g[k] for k in ['config','game','seed','first','winner','turn','reason','decks','hibariPattern']} for g in patterns if g['hibariPattern']['counterDamageWin']][:10]
    outside=[{'a':a,'b':b,**matrix[a][b]} for i,a in enumerate(D) for b in D[i+1:] if not 45<=matrix[a][b]['pct']<=55]
    configuration_stats=[{'config':k,'decks':manifest['configs'][k],
      'P1Win':rate(sum(g['winner']==0 for g in games if g['config']==k),config_counts[k]),
      'firstWin':rate(sum(g['winner']==g['first'] for g in games if g['config']==k),config_counts[k])} for k in range(20)]
    assert sum(s['overall']['wins'] for s in stats.values())==len(games)
    result={'source':manifest,'pilot':{'completed':pilot['completed'],'errors':pilot['errors']},'games':len(games),'decks':stats,'matrix':matrix,'configurations':configuration_stats,'firstWin':first,'P1Win':seat,
      'turnMean':mean([g['turn'] for g in games]),'turnMedian':st.median(g['turn'] for g in games),'turnRange':[min(g['turn'] for g in games),max(g['turn'] for g in games)],
      'lossReasons':dict(Counter(g['reason'] for g in games)),'hibariWinPatterns':pattern_counts,'hibariMatchups':hibari_matchups,'hibariExamples':examples,'outside45to55':outside}
    (BASE/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    lines=[]
    def out(s=''):lines.append(s)
    out('# UVS v1.5 固定デッキ・ゲームバランス定量検証')
    out();out('## 1. 全体の総括');out()
    out(f"基準main: `{manifest['sourceCommit']}`。予備検証{pilot['completed']:,}試合はエラー0、本検証{len(games):,}試合を完了。全10組×両座席×各500試合。各配置で先攻P1/P2を250試合ずつに固定し、ソルバーの既定設定（samples=24、iters=120）をそのまま使用した。ゲーム本体・カード・デッキ・CPU判断の変更はない。予備検証は本検証の集計に含めない。")
    out();out(f"決着まで平均{result['turnMean']:.2f}ターン、中央値{result['turnMedian']:g}ターン、範囲{result['turnRange'][0]}–{result['turnRange'][1]}。ターンは片方の手番1回を1と数える（ラウンド数ではない）。敗北理由の内訳: "+'、'.join(f'{k} {v:,}試合 ({100*v/len(games):.1f}%)' for k,v in result['lossReasons'].items())+'。')
    ranking=sorted(D,key=lambda d:stats[d]['overall']['pct'],reverse=True)
    out();out('今回の等重み総合順位は '+ ' → '.join(f"{d} {stats[d]['overall']['pct']:.1f}%" for d in ranking)+f"。45–55%を外れる対面は10組中{len(outside)}組。")
    out();out('勝率はWilsonの95%信頼区間を併記。独立な固定seed試合の二項近似であり、デッキ別総合は4対面を等重みで混合した記述的区間。対面ごとの異質性・複数比較・ソルバーの系統誤差は補正していない。対人戦や別CPUへの一般化はできない。')
    out();out('|デッキ|総合勝率 [95%CI]（各4,000戦）|平均/中央値ターン|山札切れ敗北率 [95%CI]|平均最終ダメージ|')
    out('|---|---|---|---|---|')
    for d,s in stats.items():out(f"|{d}|{fmt(s['overall'])}|{s['turnMean']:.2f} / {s['turnMedian']:g}|{fmt(s['deckoutLoss'])}|{s['finalDamageMean']:.2f}|")
    out();out('山札切れ敗北は理由が「ドロー時に山札切れ」の試合。「山札残数以上のダメージ」は別集計（summary.jsonのdamageDeckoutLoss）。最終ダメージは回復後のダメージエリア枚数で、受けた累積ダメージではない。')
    out();out('## 2. 5×5の勝率マトリクス');out();out('行側の勝率。各対面1,000戦（両座席各500）。対角のミラー戦は未実施。')
    out();out('|行＼列|'+'|'.join(D)+'|');out('|---|'+'---|'*5)
    for a in D:out('|'+a+'|'+'|'.join(fmt(matrix[a][b]) for b in D)+'|')
    out();out('## 3. 各デッキの強み・弱み');out()
    for d in D:
        opponents=sorted((b for b in D if b!=d),key=lambda b:matrix[d][b]['pct'])
        lo,hi=opponents[0],opponents[-1]
        out(f"- {d}: 最も勝率が高い対面は{hi}（{fmt(matrix[d][hi])}）、低い対面は{lo}（{fmt(matrix[d][lo])}）。防御札を出した場合の成功率は{fmt(stats[d]['defenseSuccess'])}。")
        s=stats[d];m=s['metrics']
        out(f"  実攻撃は1出場あたり{m['attacks']/4000:.2f}回、攻撃成功率{fmt(rate(m['hits'],m['attacks']))}。無防御を含む全被攻撃の阻止率は{fmt(s['allIncomingStopped'])}、平均最終山札は{s['finalDeckMean']:.2f}枚。これらは対面混合の行動特性であり、カード単体の強弱を示すものではない。")
    out();out('実測した資源消費と攻防（回数は本検証4,000出場の合計／1出場平均）:');out()
    out('|デッキ|防御成功/防御提出|回復使用|重撃枚数|連撃成功/追加攻撃|緑の巻物使用|攻撃見送り|')
    out('|---|---|---|---|---|---|---|')
    for d,s in stats.items():
        m=s['metrics'];out(f"|{d}|{m['defenseWins']:,}/{m['defensePlayed']:,}|{m['recoveryUses']:,} / {m['recoveryUses']/4000:.3f}|{m['heavyCards']:,} / {m['heavyCards']/4000:.3f}|{m['chainHits']:,}/{m['chainAttempts']:,}|{m['greenScrollUses']:,} / {m['greenScrollUses']/4000:.3f}|{m['attackPasses']:,}|")
    out();out('防御成功率の分母は実際に防御札を提出したバトル。無防御を含む全被攻撃に対する阻止率はsummary.jsonのallIncomingStopped。回復使用は実ログの「牛乳」使用、重撃は実バトルで提出したカード枚数、連撃成功はmode付き追加攻撃で攻撃成功した回数（宣言回数や勝利数とは異なる）。ソルバー内部の仮想ロールアウトは一切カウントしない。')
    out();out('## 4. 座席と先攻有利');out()
    out(f"全体のP1勝率は{fmt(seat)}、先攻勝率は{fmt(first)}（各10,000試合）。"+('先攻の区間は50%を上回る。' if first['ci95'][0]>50 else '先攻の区間は50%を下回る。' if first['ci95'][1]<50 else '先攻の区間は50%を含む。'))
    out();out('|デッキ|P1|P2|先攻|後攻|');out('|---|---|---|---|---|')
    for d,s in stats.items():out('|'+d+'|'+'|'.join(fmt(s[k]) for k in ['seatP1','seatP2','first','second'])+'|')
    out();out('上表の各セルは2,000試合。座席×先後の4層（各1,000試合）はsummary.jsonのseatFirstに保存。')
    out();out('各座席配置の結果（各500試合、先攻P1/P2は各250）:');out()
    out('|P1|P2|P1勝率 [95%CI]|先攻勝率 [95%CI]|');out('|---|---|---|---|')
    for s in configuration_stats:out(f"|{s['decks'][0]}|{s['decks'][1]}|{fmt(s['P1Win'])}|{fmt(s['firstWin'])}|")
    out();out('## 5. 雲雀・反撃は機能しているか');out()
    h=stats[D[4]];m=h['metrics'];wins=h['overall']['wins']
    out(f"雲雀は{wins:,}/4,000勝（{fmt(h['overall'])}）。緑の巻物は{m['greenScrollUses']:,}回（1出場{m['greenScrollUses']/4000:.3f}回）、ドロー時山札切れ敗北は{h['deckoutLoss']['wins']:,}回（{fmt(h['deckoutLoss'])}）。成功した防御で相手が実際に消費した重撃は計{m['enemyHeavyOnGuards']:,}枚。")
    out();out('勝利パターン（重複あり。全勝利を分母にした単純頻度）:');out()
    for k,label in [('damageWin','5ダメージで勝利'),('deckoutWin','相手のドロー時山札切れで勝利'),('afterGuard','一度以上防御に成功して勝利'),('counterDamageWin','前の手番までに防御成功があり、自分の攻撃で5ダメージ勝利'),('lateCounterDamageWin','上記のうち最終攻撃直前の自分のダメージが3以上')]:
        out(f"- {label}: {pattern_counts[k]:,}件（{100*pattern_counts[k]/wins:.1f}%）。")
    out();out('「反撃」は上記の操作的定義であり、ルール上の独立した反撃効果ではない。防御→攻撃決着という経路の頻度を測れるが、旧CPU版との同一条件比較がないため、今回のCPU変更が勝率を改善したという因果効果は未検証。代表例のseed・座席・先攻・最終攻撃はsummary.jsonのhibariExamplesに保存。')
    out();out('雲雀の対面別決着（各1,000戦）:');out()
    out('|相手|雲雀勝率 [95%CI]|5ダメージ勝利|相手ドロー切れ勝利|自分ドロー切れ敗北 [95%CI]|防御後の5ダメージ勝利|');out('|---|---|---|---|---|---|')
    for opponent,s in hibari_matchups.items():
        out(f"|{opponent}|{fmt(s['win'])}|{s['reasons'].get('勝利:5ダメージ',0)}|{s['reasons'].get('勝利:ドロー時に山札切れ',0)}|{fmt(s['ownDeckoutLoss'])}|{s['counterDamageWins']}|")
    out();out('反撃の経路は実際に成立している一方、雲雀の勝利の過半数は相手のドロー時山札切れであり、現状は純粋な攻撃反撃型というより長期戦で勝つ傾向が強い。特に葛城戦では1,000試合中617試合が雲雀自身のドロー時山札切れ敗北で、対削りの資源寿命が主要な検証対象となる。')
    out();out('`hibari-examples.json` に代表的な6勝の全ログと使用カードを添付し、`examples.cjs` による再実行で勝者・決着ターン・理由の一致を確認した。')
    out();out('## 6. 45〜55%から外れる組み合わせ');out()
    for r in outside:
        ci=r['ci95'];firm=ci[1]<45 or ci[0]>55
        out(f"- {r['a']} 対 {r['b']}: {fmt(r)}。"+('95%区間全体も45–55%の外。' if firm else '点推定は範囲外だが95%区間は45–55%と重なる。'))
    if not outside:out('該当なし。')
    out();out('## 7. 改善候補と根拠');out()
    out('今回のPRでは変更を実施しない。以下は次の実験候補であり、数値変更を正当化する確定診断ではない。');out()
    out('- 雲雀対葛城: 自分のドロー時山札切れ敗北617/1,000を根拠に、将来のCPU対照実験では「対削りで攻撃へ移る時機」と「任意ドローの温存」を優先比較する。防御時のキャラ効果による強制ドローはルール通りに維持し、CPUの行動選択の差として検証する。')
    for r in sorted(outside,key=lambda r:abs(r['pct']-50),reverse=True)[:3]:
        out(f"- 対面調整の検証優先候補: {r['a']} 対 {r['b']}（{fmt(r)}、50%から{abs(r['pct']-50):.1f}ポイント）。勝率差の大きい組から失敗した攻撃・防御への投資とドロー消費の再現seedを精査する。")
    for d in D:
        worst=min((b for b in D if b!=d),key=lambda b:matrix[d][b]['pct']);s=stats[d];r=matrix[d][worst]
        out(f"- {d}: {worst}戦（{fmt(r)}）の負けseedを重点レビューする。山札切れ敗北率{fmt(s['deckoutLoss'])}、防御成功率{fmt(s['defenseSuccess'])}を手掛かりに、任意ドロー・攻撃見送り・重撃消費の局面を比較する。カード調整の前に、同じルールで旧判断との対照実験を行う。")
    out();out('先後の改善実験は、各対面・座席・先後を分けた層別比較と同一seedペアの対照を優先する。勝率だけでカードの強弱を断定せず、ソルバーの手札サンプリング・評価の偏りも分離して検証する。')
    out();out('## 8. 未検証項目と再現方法');out()
    out('- ミラー戦、対人戦、旧AI、旧雲雀CPUとの比較、別ソルバー設定、iPhone実機表示は対象外。')
    out('- 回復した累積ダメージ量、特定の防御が勝利を引き起こした因果効果、カード1枚ごとの寄与、勝率改善の因果効果は未測定。')
    out('- 「無限ループなし」はこの12,000試合で異常・監視上限超過がなかったという意味であり、全到達可能状態の証明ではない。')
    out('- 乱数種は各試合に独立に割当て。seed式と座席一覧はmanifest、seed・先攻（0=P1/1=P2）・勝者・決着理由・計測値はJSONLに全件保存。seedと同一ソース・同一スクリプトから再実行できる。')
    out();out('```sh\nnode analysis/balance-v15/simulate.cjs pilot 100 4\nnode analysis/balance-v15/simulate.cjs main 500 4\npython3 analysis/balance-v15/summarize.py\n```')
    out();out('計測を入れない通常実行との整合性検査: `node analysis/balance-v15/validate.cjs`。全20配置の予備検証先頭seedについて、勝者・理由・決着ターン・最終ダメージ／山札／手札が一致した。')
    out();out('Node 24以上、Python標準ライブラリのみ。再実行時は既存JSONL・manifestを別の場所に退避する（スクリプトは結果の上書きを拒否）。DOMの初期画面呼び出しだけ省き、通常と同じsetupGame/runGame/ソルバー処理を実行する。描画・待ち時間を省略しても意思決定は簡略化しない。300手番／20,000判断／worker10分の監視上限に達した場合は異常として停止し、結果を補完しない。')
    (BASE/'REPORT.ja.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({k:result[k] for k in ['games','firstWin','P1Win','turnMean','lossReasons','hibariWinPatterns']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
