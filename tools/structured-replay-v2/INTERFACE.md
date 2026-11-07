# 正本とログ基盤の接続契約

この契約は提案版。正本への接続、HTMLのボタン差し替え、ルールv1.11の適用は版固定エクスポートを受領してから行う。

## 入力ポート

`UVSStructuredReplay.capture(context, {keepDiagnostics: false})` に試合の確定済みメタデータを渡す。CommonJSでも同じAPIを使用できる。正本の発行側は各処理の確定後、同期的に `receive(event)` を呼び、返り値をゲームに使わない。イベントはJSON互換値のみ。カードオブジェクト、ソルバーのコントローラ、乱数関数、ゲーム状態への参照を渡さない。受信側は防御コピーを凍結し、発行側を変更しない。イベント列の順序が処理順。観測無効時は発行側でスナップショットの作成も省略できる構成にする。

共通フィールドは `type,turn,phase,actor,source,audience,data`。席は0/1、当事者なしはnull。turnは非負整数、phaseはnull/draw/prep/battle/end。sourceは `["card",UID]`、`["ability","安定ID"]`、`["rule","安定ID"]` のいずれか。表示名が必要なら確定版のメタデータのID辞書から解決する。sourceなしはnullで、移動・削り・能力など原因が必須のイベントでは拒否する。audienceはpublic、postgame、0または1。省略時はpostgameに倒す。裏向きの攻撃・防御の公開時点は発行側が管理する。

| コード | 正本が発行する境界 | 必要データ |
|---|---|---|
| G / H | 初期化完了 / 各席初期手札 | 初期状態 / UID列。Gの初期状態には各ゾーン、キャラLv、山札順を含める |
| D / X | ドロー / 山札削り確定 | 実際のUID順、要求枚数、Dは結果の手札数 |
| M / R | 移動 / 山札返却確定 | UID順、移動元と先、Rは返却位置。各ゾーン参照は `{player,zone}` |
| N / C | ゲージ配置 / コスト支払い確定 | UID順、移動元、配置先、Cは選択直前の合法UID。秘伝は各確定順に通知 |
| O / U | 能力の機会 / 解決 | 安定能力ID、Lv、使用可・条件不足・対象なし、使用・辞退、対象UIDと実際の状態差 |
| A / B | 攻撃 / 防御宣言 | カードUIDと攻撃モード。Bは合法UID、防御なしなら no-legal / human-pass / cpu-pass |
| W / K | 重撃 / 連撃 | UIDと現在AT/DF、連撃は宣言・辞退・不可と対象UID |
| J | 攻防判定 | AT/DF/DP、AT/DFの数値内訳 `[[項目,加算値],...]`、結果。緑防御・確定ヒットも結果で明示 |
| P / V | ダメージ確定 / キャラ変化 | 前後のダメージ枚数と関連UID、Vは前後Lv・移動個体・実AT/DF |
| T / E | ターン終了 / 決着 | ゾーン・Lv・ダメージの確定状態、Eは勝者・敗者・理由・LO席またはnull |
| Q | 選択確定 | 実際の合法候補と選択値。合法集合の生成はエンジンの責任 |

D/X/R/N/Cなど移動を具体的に表すイベントが発行された場合、同じ移動をMで重ねて発行しない。G/T/Eの状態には `players[].zones.{hand,deck,discard,gYo,gIn,damage,charDeck}` と `players[].level` を含める。キャラ変化とダメージを別イベントとする場合は共通の原因を維持し、通常文では同じゾーン移動を二重に数えない。 `diagnostic` は別トレースにのみ保存。発行されなければ空で、推測で補完しない。

実際の現行 `engine.js` / `sim_src/engine.js` で確認できたのはrender、turnStart、phase、turnEnd、gameOver、statの入口。statの攻防候補は件数で、個体UID・原因付きの移動列はない。 `sim_src/cards_extra.js` のemitは空。上の表を満たす版固定フックが未入手。v111のローカル総当たり集計は見つかったが、この契約の60局データではない。

## コンパクト詳細リプレイ

UTF-8のJSON Lines。先頭行にformat、版2、context、legend、phaseCodes、列順、strings、replay。中間行は `[code,turn,phaseIndex,actor,source,audience,...payload]`。payloadの順序はそのコードの凡例どおり。終端は `["Z",行数,現在状態]` で、欠落や行数不一致は拒否する。stringsは繰り返すpayloadの文字列・キーを参照する辞書。 `~0` などが辞書参照、先頭の `~~` はリテラルの `~`。

contextにはルール版、既存リプレイ互換版、UI版、カード版・ハッシュ、実装識別子、RNG方式とseed、先攻と抽選方式、全デッキ、全個体カード辞書、AI設定、主要パラメータと計算式を入れる。v1.11を含む各ルールの値は版固定エクスポートから受け取る。 `replay` は操作列、カード対応表、初期状態、保存境界。乱数内部状態が発行できる場合はcontextまたは保存状態に格納し、未提供時はseed＋抽選方式＋操作列による再計算を使う。

L行は旧観測の移植専用。 `kind,data,delta,beforeDelta` を持ち、連続する状態を差分として可逆保存。差分は `null` 維持、`[0,値]` 置換、`[1,[キー,差分],...]` オブジェクト、`[2,開始,削除数,...追加]` 配列区間、`[3]` 削除、`[4,[位置,差分],...]` 同長配列。旧データにない原因はnullのまま。LはB照合に使えない。分離したAIトレースを戻すと旧観測列全体が復元できる。

## コピー・ロードの接続

ゲームのコピーは `encode(context,replay,events,current)` の全文。通常文は `UVSNormalLog.format` の表示用途。ロードは `load(text,{installed,parseLegacy,prepare,commit})` を用い、旧v1.9の解析を既存パーサーに委譲する。 `prepare` は隔離状態でルール・初期状態・操作・保存境界を照合して再生する。 `commit` は準備が成功したときだけ呼ばれる。実ゲームで同時ロードを防ぐことと、失敗時の状態保持は接続側の責任。既存HTMLには未配線で、ローカルの旧再生器を使ったオフライン試験で確認した。

## 60局の照合データ

PC側とHTML側から `{format:"UVS comparison cases",version:1,role:"pc" または "html",cases:[...]}` を出す。各caseに一意の `id`、同条件の `context`、`result:{ops,winner,reason,damageHistory,turn,finalZones,rngState}`、`events`、`normal` を入れる。rngStateが取れない場合はnullまたは省略。実装識別子は双方の報告に残す。正本とHTMLで共通の決定的なUID付与を使用し、カード名で照合しない。

`node compare.cjs pc-60.json html-60.json comparison.json` は各60件と入力条件を検査し、A/B/C別にSHA256と差分件数を保存する。オブジェクトのキーはJSのUTF-16コード単位順で整列、カード辞書はUID昇順。デッキ構成とイベント・ゾーン・候補配列は順序を維持。有限数をJSON数値で出し-0を0に正規化する。Aは結果、Bは通知列から診断・表示用audienceを除いた値、Cは平文のCRLF/CRをLFに揃えた値。すべてUTF-8。Cの差だけでは異常終了しない。AまたはBの差は終了コード1。RNG内部状態が片側でも欠落なら未取得数を出す。
