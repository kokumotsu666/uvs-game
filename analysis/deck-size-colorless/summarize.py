"""Japanese report and machine-readable metrics; actual completed games only."""
import json,math,statistics as st
from pathlib import Path
from collections import Counter
B=Path(__file__).resolve().parent
K='葛城・削り';Y='柳生・射撃';H='雲雀・反撃'
def rate(k,n):
    if not n:return {'count':k,'n':n,'pct':None,'ci95':None}
    z=1.959963984540054;p=k/n;den=1+z*z/n
    mid=(p+z*z/(2*n))/den;r=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    return {'count':k,'n':n,'pct':100*p,'ci95':[100*(mid-r),100*(mid+r)]}
def fmt(r):return f"{r['pct']:.1f}% [{r['ci95'][0]:.1f}–{r['ci95'][1]:.1f}]" if r['n'] else '—'
def mean(x):return st.mean(x) if x else None
def main():
    m=json.loads((B/'main-manifest.json').read_text());pilot=json.loads((B/'pilot-manifest.json').read_text())
    g=sorted([json.loads(s) for s in (B/'main-games.jsonl').read_text().splitlines()],key=lambda x:(x['size'],x['config'],x['game']))
    assert m['completed']==6000==len(g) and not m['errors']
    assert len({(x['size'],x['config'],x['game']) for x in g})==6000
    assert all(sum(x['size']==size and x['config']==c for x in g)==500 for size in [30,35,40] for c in range(4))
    baseline=[x for x in g if x['size']==30];assert len(baseline)==2000 and all(x['baselineMatch'] for x in baseline)
    keys=['destroyNeutral','destroyNormal','drawNeutral','costNeutral','costNormal','neutralDamage','neutralHand','neutralDeck','neutralDiscard']
    groups=[]
    for opp in [Y,H]:
        base={x['seed']:x for x in g if x['size']==30 and opp in x['decks']}
        for size in [30,35,40]:
            rows=[x for x in g if x['size']==size and opp in x['decks']];n=len(rows);wins=sum(x['katsuragiWin'] for x in rows)
            assert len(rows)==1000
            players={}
            for d in [K,opp]:
                data=[(x,x['decks'].index(d)) for x in rows]
                metrics={k:sum(x['players'][i][k] for x,i in data) for k in keys}
                players[d]={**metrics,'neutralDrawGameRate':rate(sum(x['players'][i]['drawNeutral']>0 for x,i in data),n),
                  'deckoutLossRate':rate(sum(x['winner']!=i and x['reason']=='ドロー時に山札切れ' for x,i in data),n),
                  'damageDeckoutLossRate':rate(sum(x['winner']!=i and x['reason']=='山札残数以上のダメージ' for x,i in data),n),
                  'win':rate(sum(x['winner']==i for x,i in data),n)}
            diffs=[int(x['katsuragiWin'])-int(base[x['seed']]['katsuragiWin']) for x in rows]
            delta=100*mean(diffs);se=100*st.stdev(diffs)/math.sqrt(n)
            changed=sum(v!=0 for v in diffs)
            result={'opponent':opp,'size':size,'games':n,'katsuragiWin':rate(wins,n),'opponentWin':rate(n-wins,n),
              'turnMean':mean([x['turn'] for x in rows]),'turnMedian':st.median(x['turn'] for x in rows),'turnRange':[min(x['turn'] for x in rows),max(x['turn'] for x in rows)],
              'players':players,'totalMetrics':{k:sum(players[d][k] for d in [K,opp]) for k in keys},
              'anyNeutralDrawGameRate':rate(sum(any(p['drawNeutral']>0 for p in x['players']) for x in rows),n),
              'hibariCounterWins':sum(x['hibariCounterWin'] for x in rows),'lossReasons':dict(Counter(x['reason'] for x in rows)),
              'katsuragiWinReasons':dict(Counter(x['reason'] for x in rows if x['katsuragiWin'])),
              'pairedDeltaVs30':{'percentagePoints':delta,'ci95':[delta-1.959963984540054*se,delta+1.959963984540054*se],'changedWinnerSeeds':changed},
              'seatStats':[]}
            for c in sorted({x['config'] for x in rows}):
                rr=[x for x in rows if x['config']==c]
                result['seatStats'].append({'config':c,'decks':rr[0]['decks'],'games':len(rr),
                  'katsuragiWin':rate(sum(x['katsuragiWin'] for x in rr),len(rr)),
                  'firstWin':rate(sum(x['winner']==x['first'] for x in rr),len(rr))})
            groups.append(result)
    summary={'baselineCommit':m['sourceCommit'],'manifest':m,'pilot':pilot,'baselineMatches':2000,'groups':groups}
    (B/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    lines=[]
    def out(t=''):lines.append(t)
    out('# UVS v1.5 山札枚数・特殊無色カード比較実験');out()
    out('## 1. 実施概要');out()
    out(f"基準はmain `{m['sourceCommit']}`。葛城対柳生／葛城対雲雀に対して30・35・40枚の各条件を1,000試合ずつ、計6,000試合実行した。各対面・条件で両座席各500、各座席の先攻P1/P2各250とした。予備120試合（本検証の先頭10seedずつを再利用）も異常0。本検証6,000試合のエラー・監視上限超過も0。予備対戦を本検証の集計には重複加算していない。")
    out();out('通常カード30枚、ルールv2、現行ソルバー（samples=24、iters=120、既定の重み・重撃方針）を固定。index.html・公開版は変更せず、VM内にだけ特殊処理を注入した。基準ソースのSHA256はmanifestに保存し、不一致なら実行を拒否する。')
    out();out('## 2. 勝率・決着ターン・山札切れ');out()
    out('勝率は葛城側。95%CIはWilson法。ターンは片方の手番1回を1と数える。各行1,000試合。');out()
    out('|相手|枚数|葛城勝率 [95%CI]|相手勝率 [95%CI]|平均/中央値ターン|葛城のドロー時山札切れ敗北 [95%CI]|相手のドロー時山札切れ敗北 [95%CI]|');out('|---|---|---|---|---|---|---|')
    for s in groups:out(f"|{s['opponent']}|{s['size']}|{fmt(s['katsuragiWin'])}|{fmt(s['opponentWin'])}|{s['turnMean']:.2f} / {s['turnMedian']:g}|{fmt(s['players'][K]['deckoutLossRate'])}|{fmt(s['players'][s['opponent']]['deckoutLossRate'])}|")
    out();out('「山札残数以上のダメージ」による敗北はドロー時山札切れとは別に集計した（summary.jsonのdamageDeckoutLossRateおよび後述の勝因内訳）。')
    out();out('同一seedの30枚条件との差（葛城勝率の増減、単位はパーセントポイント）:');out()
    for s in groups:
        if s['size']==30:continue
        d=s['pairedDeltaVs30'];out(f"- 対{s['opponent']}・{s['size']}枚: {d['percentagePoints']:+.1f}ポイント、対応あり差の95%区間 [{d['ci95'][0]:+.1f}, {d['ci95'][1]:+.1f}]。勝者が変わったseedは{d['changedWinnerSeeds']}/1,000。")
    out();out('差の区間は各seedの勝敗差（−1/0/+1）の標本標準誤差による正規近似。各条件の勝率区間はWilson法。3条件間は同一seedで対応し、独立標本として扱わない。複数比較補正、CPUの系統誤差、対人戦への外挿は対象外。')
    out();out('## 3. 無色カードと通常カードの実測');out()
    out('以下は両プレイヤー合計の枚数。括弧内は1試合平均。通常ドローはdraw(p,n)経由のすべての上からのドロー（手番・サポート・キャラ効果）で、ダメージエリアへの移動は含まない。');out()
    out('|相手|枚数|破壊された無色|破壊された通常|ドローした無色|どちらかが無色を1枚以上引いた試合 [95%CI]|');out('|---|---|---|---|---|---|')
    for s in groups:
        t=s['totalMetrics'];out(f"|{s['opponent']}|{s['size']}|{t['destroyNeutral']:,} ({t['destroyNeutral']/1000:.3f})|{t['destroyNormal']:,} ({t['destroyNormal']/1000:.3f})|{t['drawNeutral']:,} ({t['drawNeutral']/1000:.3f})|{fmt(s['anyNeutralDrawGameRate'])}|")
    out();out('プレイヤー別（破壊枚数は、そのプレイヤーの山札から失われた枚数。破壊を発生させた側の枚数ではない）:');out()
    out('|相手|枚数|対象デッキ|破壊無色|破壊通常|無色ドロー|無色ドローあり試合 [95%CI]|使用コストで捨てた無色/通常|');out('|---|---|---|---|---|---|---|')
    for s in groups:
        for d,p in s['players'].items():out(f"|{s['opponent']}|{s['size']}|{d}|{p['destroyNeutral']}|{p['destroyNormal']}|{p['drawNeutral']}|{fmt(p['neutralDrawGameRate'])}|{p['costNeutral']} / {p['costNormal']}|")
    out();out('ドロー後に捨て札へ送った無色やダメージエリアへ移動した無色は、「山札破壊で失われた無色」には加算しない。破壊要求枚数ではなく、実際に山札から取り除いた枚数を計測した。')
    out();out('## 4. 葛城の勝ち方と雲雀の反撃');out()
    out('|相手|枚数|葛城総勝利|5ダメージ勝利|相手ドロー時山札切れ|山札残数以上のダメージ|雲雀の防御後攻撃勝利|');out('|---|---|---|---|---|---|---|')
    for s in groups:
        r=s['katsuragiWinReasons'];out(f"|{s['opponent']}|{s['size']}|{s['katsuragiWin']['count']}|{r.get('5ダメージ',0)}|{r.get('ドロー時に山札切れ',0)}|{r.get('山札残数以上のダメージ',0)}|{s['hibariCounterWins'] if s['opponent']==H else '対象外'}|")
    out();out('雲雀の「防御後攻撃勝利」は、以前の手番に実際の防御成功があり、最終バトルが雲雀の攻撃成功で、敗北理由が「5ダメージ」の試合。前回調査と同じ操作的定義で、ルール上の反撃効果や防御の因果効果を示すものではない。')
    out();out('## 5. 解釈と比較上の注意');out()
    for opp in [Y,H]:
        ss=[s for s in groups if s['opponent']==opp];best=min(ss,key=lambda s:abs(s['katsuragiWin']['pct']-50))
        out(f"- 対{opp}: 葛城勝率は "+' → '.join(f"{s['size']}枚 {fmt(s['katsuragiWin'])}" for s in ss)+f"。点推定で50%に最も近いのは{best['size']}枚条件。")
    out('- 雲雀のドロー時山札切れ敗北は617→450→286件と減少し、防御後の攻撃勝利は166→280→328件と増えた。一方、葛城の5ダメージ勝利は94→126→207件、「山札残数以上のダメージ」勝利は57→103→137件に増えており、山札切れ以外の勝ち筋への移行も観測された。')
    out('- 柳生もドロー時山札切れ敗北は158→37→4件に減ったが、葛城との勝率は30枚時点でほぼ互角だった。この特殊処理は対雲雀の偏りを縮める一方、対柳生では葛城不利側へ動くため、全対面へ一律採用する根拠にはならない。')
    out('- 使用不能カードを引く副作用も実測された。40枚条件の雲雀は1,000試合で2,568枚の無色を引き、602試合で少なくとも1枚引いた。山札切れの緩和と手札の死に札化は同時に起きている。')
    out();out('これは「通常カードを増やす35/40枚デッキ」の実験ではなく、山札下の使用不能カードが破壊を優先して受ける特殊条件の実験である。山札寿命・手札の死に札・破壊で失われる通常カード・ソルバーの判断が同時に変化するため、勝率差を単一要因の効果として分離できない。')
    out();out('ソルバーの判断ロジックは変更していないが、山札残数・手札枚数・未知手札サンプリングのプールには無色も含まれる。この入力変化でドロー評価や攻防判断が変わり得る。無色を認識する追加戦術や、未知手札サンプルから無色を除く補正は入れていない。')
    out();out('## 6. 特殊処理の仕様と変更差分');out()
    out('- 公開index.htmlは変更なし。新規ファイルはanalysis/deck-size-colorless以下のみ。runtime.cjsが元HTMLのscriptを順に評価し、DOM起動画面だけ省略する。')
    out('- CONFIG.deckSizeは通常30枚リストを選択するため30のまま固定。setupGameが通常30枚を毎試合シャッフルして初手4枚を配った直後、両者の残り通常26枚の下に無色を5/10枚追加する。これは「通常30枚＋末尾無色」から初手4枚を取る処理と同一で、通常カードの初手・順序と乱数消費は3条件で一致する。')
    out('- 無色は一意UID付きtype=colorless、属性は無、技なし、AT/DF/DP=0、アイコンなし、GPは0/0、効果なし。CARDSやDECKSの通常カード定義・種類・枚数は変更しない。')
    out('- ドローは既存drawをそのまま呼び、無色が手札へ入った実枚数だけ追加計測する。無色はbaseUsable/canAttack/canDefend/heavyOKの既存条件を満たさず、サポート使用・ゲージ配置・攻防・重撃・連撃に出せない。ソルバーの手札効用は0。')
    out('- VM内のmillを、追加カード定義が関数を捕捉する前に差し替える。破壊は山札内で最も上にある無色を優先し、不足分だけ通常カードを上から捨て札へ送る。通常カード同士の相対順は維持する。')
    out('- 破壊として扱う呼出し元は効果、ドラゴンベアード、葛城Lv4、葛城Lv5、雲雀Lv5。未知のmill呼出し元は黙って分類せずエラーにする。リミットブレイクは自分の山札を捨てる使用コストと解釈し、通常どおり上から処理し、破壊枚数と別計測する。')
    out('- 無色がないmillは元のmillへ委譲。30枚条件は既存シミュレーターの全2,000試合と、勝者・理由・ターン・最終状態・攻防/回復/重撃/連撃等の計測値が一致した。')
    out('- 山札下への戻し、通常の手札捨て、ダメージエリアへの移動等は元の処理のまま。無色は自身の効果を発動できないが、一般的な手札の捨て/入れ替え対象にはなる。初期配置後に通常カードが山札下へ戻ると無色より下に来る場合もあり、初期以外の並べ直しはしない。')
    out('- 各試合終了時に、無色の山札・手札・ダメージ・捨て札の合計が追加枚数と一致することを検査する。')
    out();out('## 7. 検査結果・再現方法');out()
    out('- test.cjs: 13シナリオ/配置検査に成功。無色優先・不足時の通常上からの破壊・空山札・自分の使用コスト・通常ドロー・禁止用途・山札下へ戻し・ダメージ移動・追加カード関数の捕捉・初期通常カード順序の一致を確認。')
    out('- 計測なしの元エンジンとも全4座席の代表seedで照合。さらに本検証の30枚条件2,000件は前回のmain-games.jsonl（分析コミット6d79eb8）から抽出したbaseline-reference.jsonlの全件に一致。')
    out('- 全条件の本検証6,000件は正常終了し、無色の枚数保存検査も全件通過。300手番・20,000判断・worker10分の監視上限超過なし。')
    out();out('```sh\nnode analysis/deck-size-colorless/test.cjs\nnode analysis/deck-size-colorless/run.cjs pilot\nnode analysis/deck-size-colorless/run.cjs main\npython3 analysis/deck-size-colorless/summarize.py\n```')
    out();out('Node 24以上、Python標準ライブラリのみ。既存結果は上書きを拒否するため再実行前に退避する。seedは1000000+[10,11,18,19][config]×10000+game、先攻はgame%2。条件間で同じ通常カード順序・seed・先攻を使う。各試合のsize/config/game/seed/first/winner/決着理由と実測値をJSONLへ保存。時刻と書込み順は再実行で変わり得る。')
    out();out('## 8. 未検証項目');out()
    out('- 対人戦、ミラー戦、今回以外の対面、通常カードを追加する35/40枚構成、無色を全体シャッフルする構成、別CPUは未検証。')
    out('- 今回の3デッキに含まれない効果との相互作用を網羅的には検証していない。将来のカード・mill呼出し元には分類と追加検査が必要。')
    out('- ブラウザ・iPhone上での無色表示やUI操作は対象外。無色は実験VM内のみ存在し、公開ゲームには追加していない。')
    out('- 勝率差の原因を「山札延長」「破壊対象の変更」「死に札」「ソルバーの入力変化」に分解する対照実験は未実施。旧CPUとの因果比較、多重比較補正も未実施。')
    out('- 6,000試合で異常がないことは、無色を含む全到達可能局面での停止性の証明ではない。')
    (B/'REPORT.ja.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps([{k:s[k] for k in ['opponent','size','katsuragiWin','turnMean','hibariCounterWins','pairedDeltaVs30']} for s in groups],ensure_ascii=False,indent=2))
if __name__=='__main__':main()
