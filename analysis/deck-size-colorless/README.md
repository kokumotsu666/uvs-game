# 山札枚数・特殊無色カードの比較

日本語の仕様・実測値・検証範囲は `REPORT.ja.md`、機械可読集計は `summary.json`。

通常のゲーム本体は変更しない。Node 24以上、Python標準ライブラリのみで実行する。

```sh
node analysis/deck-size-colorless/test.cjs
node analysis/deck-size-colorless/run.cjs pilot
node analysis/deck-size-colorless/run.cjs main
python3 analysis/deck-size-colorless/summarize.py
```

再実行前に `pilot/main-games.jsonl` とmanifestを退避する（上書きは拒否）。

## ファイル

- `runtime.cjs`: 元HTMLのscriptをVMに読み込み、drawの計測、millの特殊処理、末尾無色の追加だけを実験用に行う。通常カード・CPUは改変しない。
- `run.cjs`: 4workerで条件・座席を実行。予備10試合×12配置、主実験500試合×12配置。
- `test.cjs`, `validation.txt`: 仕様・相互作用・通常実行との一致検証。
- `summarize.py`: 95%CI・対応あり差・日本語レポートの生成。
- `baseline-reference.jsonl`: 分析コミット6d79eb8のmain-games.jsonlから対象2対面の2,000件を抽出。30枚条件は全件と照合する。
- `pilot-games.jsonl`, `main-games.jsonl`: 各試合の入力と結果。予備は本検証の先頭seedを使い、集計へ重複加算しない。
- `*-manifest.json`: 元ソースのコミット・ハッシュ、CPU設定、seed式、座席、実行数、エラー、時刻。

## 乱数・座席

config 0 = P1柳生/P2葛城、1 = P1葛城/P2柳生、2 = P1葛城/P2雲雀、3 = P1雲雀/P2葛城。

seed = 1000000 + [10,11,18,19][config] * 10000 + game。
gameは0〜499、first = game % 2（0=P1/1=P2）。同じseed/配置を3条件すべてに使い、通常30枚の初手・並びを一致させる。CPU判断中の乱数消費は、入力される山札サイズが変われば変わり得る。

seedはsetupGame用であり、UIのコイントスを含む通常リプレイのseedに直接転記するものではない。worker数・完了順は勝敗を変えないが、JSONLのバッチ書込み順とmanifest時刻は変わり得る。

## 指標

`players[i]` はvictim/所有者基準。destroyNeutral/Normalはそのプレイヤーの山札から**破壊**で取り除かれた実枚数。costNeutral/Normalはリミットブレイクの使用コストで、破壊とは別。drawNeutralは既存draw APIの上からのドローで引いた無色（手番・サポート・キャラ効果を含む）。ダメージエリア移動はdrawへ加算しない。

無色を一度引いて山札下に戻し再び引いた場合、drawNeutralは累積で2回と数える。neutralHand/Deck/Damage/Discardは最終状態であり、各プレイヤーの4領域の合計が追加枚数と一致することを毎試合検査する。

無色は自分の効果を発動せず攻防等にも出せないが、一般的な手札捨て/山札下への入れ替え対象にはなれる。初期配置後の通常カードの山札下への戻しを妨げず、無色の下へ通常カードが来ることも許容する。未知のmill呼出し元を検出した場合は分類なしに継続せず停止する。

30枚条件の `baselineMatch` は全試合でtrueでなければ停止する。35/40枚条件はnull（同じ結果になるべき条件ではない）。勝率はWilson 95%CI、同一seedの30枚条件との差は対応あり勝敗差の正規近似区間。複数比較補正・対人戦への外挿・要因分解はしていない。
