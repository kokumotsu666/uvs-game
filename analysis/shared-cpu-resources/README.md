# CPU共通資源管理の実装・検証

結論と実測は `REPORT.ja.md`、集計は `summary.json`。現在の初期係数Bは攻撃指標・重点対面が退行しており、採用非推奨。main/公開版へ反映しない検証用PR。

## コミット分離

- `6803bcb`: 第1段階。共通化だけで判断維持。
- `4207462`: 第2段階。共通資源評価と公開情報サンプリング。
- `db83b6e`: 同じ判断を保つ計算キャッシュ。

`baseline.html` は基準main d757ca8、`refactor.html` は第1段階、`pre-cache.html` は判断変更後のキャッシュ前、`candidate.html` は最終Bの検証スナップショット。公開エントリではない。index.htmlはcandidate.htmlと同一。

## 再現

Node 24以上、Python標準ライブラリ。既存結果を退避してから実行する（上書き拒否）。

```sh
node analysis/shared-cpu-resources/refactor-check.cjs
node analysis/shared-cpu-resources/test.cjs
node analysis/shared-cpu-resources/compare-run.cjs A
node analysis/shared-cpu-resources/compare-run.cjs pilot
node analysis/shared-cpu-resources/compare-run.cjs B
python3 analysis/shared-cpu-resources/summarize.py
```

seed=1000000+config×10000+game、先攻=game%2（0=P1/1=P2）。configの並びはmanifestを参照。20配置各500試合、各対面1,000、各デッキ4,000出場。A/AとB/Bで同じseed/座席/先後を対応付ける。サンプル24・反復120を減らしていない。

## ファイル

- `harness.cjs`: 元のHTML各scriptをVMで実行。描画起動だけ省略。実drawの返値で枚数を計測し、元のstat hookで攻防・見送りを観測。
- `refactor-check.cjs`, `refactor-games.jsonl`, `refactor-operations.jsonl.gz`, `refactor-validation.json`: 2,000試合＋旧AI40試合の全操作一致検査。gzipは連結メンバーのJSONL。
- `test.cjs`, `implementation-validation.txt`: カード/ルール/デッキ/CSS不変、資源局面、非公開情報Proxy、裏向き札getter、隠れた配置の不変性、全20配置の動作確認。
- `A/B-games.jsonl`, `A/B-manifest.json`: 各10,000試合の実測。全入力・結果・操作数/SHA256・実ドロー・攻防・見送りを保存。
- `pilot-*`: 最終Bの200件の動作確認。主集計へ加えない。
- `pre-cache-games.jsonl`, `pre-cache-manifest.json`, `pre-cache-pilot-*`: キャッシュ前Bの中断済み1,000件と予備200件。最終Bへ重複加算しない。
- `cache-validation.json`: 上記1,200照合（重複除外1,180seed）の全操作SHA256・全指標一致。
- `baseline-reproduction.json`: Aの10,000件が過去の分析コミット6d79eb8と同一決着/最終状態であることを確認。
- `browser-smoke.cjs`, `browser-validation.json`: ローカル390×844で開始・CPU手番・ログを確認。PlaywrightとChromiumが別途必要。iPhone実機は未検証。
- `DESIGN.ja.md`: 共通処理/専用戦術の分類と設計。

## 指標と解釈

実ドローは初手4枚を含む。破壊/使用コスト/ダメージ移動/戻しはdrawへ数えない。山札切れは「ドロー時に山札切れ」。ダメージによる山札枯渇は別集計。

`noUsableAttack` はnoatkイベント（GP不足等を含む）、`emptyHandAttackSkip` はそのうち手札0枚、`declinedLegalAttack` はダメージを与える合法候補があるのにnullを返した回数。連撃追加の使用可能札なし専用分岐はnoatkへ入らない。

攻撃成功数はDP>0の攻撃成功、全被攻撃阻止率は防御成功/全被攻撃、提出時防御成功率は防御成功/防御札を出した回数。攻撃・成功攻撃は自分の手番数でも正規化し、長期化だけによる回数差と区別する。

勝率はWilson 95%CI、対応あり差はseedごとの勝敗差の正規近似。対面の異質性・多重比較・試合内イベント相関は補正していない。Bの変化には公開情報サンプリングも含まれ、資源係数だけの因果効果ではない。混合A/B対戦や対人戦も未実施。

資源関数のキャッシュは1判断の間だけ有効。コントローラ・assess/evalBattle入口では自動破棄する。診断コードが状態を直接変更してresources関数を直接呼ぶ場合は、先にresources.beginDecision()を呼ぶ。
