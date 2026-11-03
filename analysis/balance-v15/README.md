# UVS v1.5 balance measurement

日本語の分析は `REPORT.ja.md`、機械可読の集計は `summary.json` を参照。

## Files

- `simulate.cjs`: production HTML scriptsをVMで実行する計測器。Node 24以上、外部依存なし。
- `validate.cjs`: 計測なしの実行と予備検証の先頭seed（全20配置）を照合する。
- `summarize.py`: 本検証のみを集計し、Wilson 95%CI付き日本語レポートを生成する。Python標準ライブラリのみ。
- `pilot-games.jsonl`, `main-games.jsonl`: 予備・本検証の試合単位の全データ。
- `*-manifest.json`: 対象ソース、seed式、CPU設定、実行数、エラー、開始終了時刻。
- `validation.txt`: 計測なし実行との照合結果。
- `examples.cjs`, `hibari-examples.json`: 雲雀の代表的な勝利を再実行し、実バトルのカード名・攻防値・全ログを保存。

## Reproduce

リポジトリルートで実行。既存結果ファイルを退避してから再実行する。

```sh
node analysis/balance-v15/simulate.cjs pilot 100 4
node analysis/balance-v15/validate.cjs
node analysis/balance-v15/simulate.cjs main 500 4
python3 analysis/balance-v15/summarize.py
node analysis/balance-v15/examples.cjs
```

4はworker数。各workerは独立したVM・エンジン・乱数状態を持つ。worker数と完了順は勝敗・計測値に影響しない。`ms`とmanifestの時刻、JSONLのバッチ書込み順は再実行で変わり得る。ゲームの識別子は `(phase, config, game)`、再現の入力は `decks, seed, first`。

configはmanifestのconfigs配列の0始まりの添字。gameは各配置の0始まりの試合番号。first/winnerは0=P1、1=P2。対戦seedはsetupGameへ与える乱数の初期値であり、UIのコイントス（指定先攻でも乱数を1回消費）を含むリプレイヘッダへ直接転記する用途ではない。

ゲームロジックはHTMLの全scriptを順にそのまま評価する。唯一省く呼出しはDOM初期画面の `startScreen()`。公開アプリと同じ固定デッキ初期化、setupGame、runGame、makeSolverを使う。描画hookを登録せず、delay=0とし、ソルバーのsamples/iters/重み/重撃方針を変更しない。選択の代理実装やルールの再実装はない。

計測は実バトルの既存 `stat` hookと終了時の実ログを使う。判断回数監視のwrapperは元のメソッドに同じthis/引数で委譲し、返値を変えない。正常終了には `G.over` とエラーなしが必要。監視上限は異常を検出するためのもので、試合を引分や勝敗に補完しない。

## Metric interpretation

- `players[i].defenseWins / defensePlayed`: 実際に防御札を出した場合の防御成功率。全被攻撃に対する阻止率は分母incoming。
- `recoveryUses`: 実ログに記録されたサポート「牛乳」の使用回数。回復量ではない。
- `heavyCards`: 実際に提出した攻守の重撃カード枚数。シミュレートされた重撃は含まない。
- `chainHits`: mode付きの実追加攻撃が成功した回数。DP0や終局処理も現行エンジンの結果に従う。
- `greenScrollUses`: サポート「緑の巻物」の使用回数。キャラ効果等の強制ドローとは区別する。
- `damage`: 最終ダメージエリア枚数。回復を差し引いた最終状態であり、累積被ダメージではない。
- `reason`: エンジンの敗北理由をそのまま保存。「ドロー時に山札切れ」と「山札残数以上のダメージ」を区別する。
- `hibariPattern`: 雲雀勝利時のみ保存。過去の防御成功後に攻撃で5ダメージ勝利する経路を操作的に反撃勝利と呼ぶ。防御の因果効果を示す指標ではない。

勝率の95%CIはWilson二項近似。固定seed系列での実測を記述し、対人戦への外挿・多重比較補正・ソルバーの系統誤差評価は行わない。防御成功率は同一試合内で依存するイベントを含み、付記区間はクラスター補正していない。
