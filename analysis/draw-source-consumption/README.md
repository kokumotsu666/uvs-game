# PR #3 ドロー発生源の計測

日本語レポート: `REPORT.ja.md`。集計: `summary.json`。

## 再現

PR #3の実験ファイルと本体index.htmlを固定したまま、リポジトリルートから実行する。

```sh
node analysis/draw-source-consumption/test.cjs
node analysis/draw-source-consumption/run.cjs pilot
node analysis/draw-source-consumption/run.cjs main
python3 analysis/draw-source-consumption/summarize.py
```

Node 24以上、Python標準ライブラリ。既存結果は上書きを拒否するため退避してから再実行する。

## 成果物

- `meter.cjs`: PR #3のengine/playに受動的な計測を追加。元のdrawを呼び、実戻り値・手札増分・山札減分を照合。元ソースの呼出し行で発生源を分類する。
- `run.cjs`: 同じ6,000試合と予備120試合。PR #3全件との照合に不一致があれば停止する。
- `test.cjs`, `validation.txt`: 静的21呼出し行、全12配置の代表seed、山札不足/空山札、牛乳によるキャラ能力再発動、合成未分類呼出し検出を検査。
- `main-games.jsonl`: 試合別入力・勝敗・最終状態・発生源集計・非ドロー移動・PR #3一致フラグ。
- `main-draws.jsonl.gz`: 実draw関数の全呼出し。連結gzipメンバーのJSONL。Python gzip.openで全件読める。
- `pilot-*`: 本検証の先頭seedによる別計測。主集計には加算しない。
- `*-manifest.json`: 完了件数、ドロー呼出し数、未分類数、異常、時刻、基準コミット。
- `summary.json`: 対面・山札枚数・各デッキ別のカテゴリ/カード/能力集計、使用時分布、山札切れクロス集計。
- `unclassified-draws.json`: 実測の未分類イベント（0件なら空配列）。

## イベント項目

`size/config/game/seed/first` はPR #3と同じ。pは0=P1、1=P2。category/sourceは直接の発生源。parentSupportsは牛乳/赤の巻物など、スタック上で確認できる親サポート。

requested/actualは要求枚数/実ドロー枚数。beforeDeck/beforeNormal/beforeNeutralは実draw関数入口の山札配列の枚数。normalDrawn/neutralDrawnは実際に手札へ入った内訳。damageは呼出し直前のダメージ枚数。turn/phase/siteは状態・元ソース上の位置。

PR #3の初期配布は通常30枚だけの配列から4枚引いた後に末尾無色を追加する。このため初期手札イベントでは実配列のbeforeDeck=30、beforeNeutral=0となる。pendingInitialNeutralに未挿入5/10枚、effectiveBeforeDeck/Neutralに論理的な35/40枚の残数を併記する。実ドロー数は補正せず、すべて本関数の実測値。

カードを山札下に戻す操作は `nonDrawMoves.kind=return`、ダメージエリアへの移動は `damageMove`。millの破壊/使用コストはPR #3の既存計測。いずれもdrawへ加算しない。

## 解釈

通常ドローはターン開始分で、初期手札を別掲する。能力ドローはキャラクター能力。カード効果は緑の巻物＋その他サポート＋バトルカード。緑の割合は初期手札込みの全実ドローに対する合計比率で、初手除外値もJSONに保存。

柳生の入れ替えでは「戻して引く」ため、総ドローと山札の純減が異なる。returnedは戻した操作の発生源に帰属させ、actual-returnedを会計上の純減寄与とする（戻したカードを最初に引いた発生源へ遡及配分するものではない）。総ドローは同じカードの再ドローも数える。

巻物使用回数と山札切れ敗北率の関連は観測上の関連であり、因果効果ではない。巻物を使わない反実仮想は実行していない。
