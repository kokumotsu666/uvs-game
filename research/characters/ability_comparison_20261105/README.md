# 新旧キャラ能力の比較実験

- [日本語レポート](research_report.md)：結果、対面、能力活用、AIの限界、暫定判断
- [対面勝率CSV](matchup_rates.csv) / [新旧差CSV](ability_comparisons.csv)
- [主比較集計JSON](results_summary.json) / [能力活用度JSON](ability_utilization.json)
- [本比較の対面別活用度](ability_matchups_final.json) / [独立確認の対面別活用度](ability_matchups_confirm.json)
- [新旧能力・発動順序・選択仕様](ability_spec.json)
- [固定デッキ・AI・seed等の条件](protocol.json) / [事前登録比較](preregistered_comparisons.json)
- [seedごとの4試合平均](paired_seed_wins.json)
- [選択AI・病院不使用方針の診断](sensitivity_results.json) / [追加のLv別観測](supplementary_observations.json)
- [零分散区間の品質補正](uncertainty_correction.json)
- [暫定判断](judgments.json)
- [単体テスト](implementation_tests.json) / [予備対照](preflight_verification.json) / [実行検査](execution_verification.json) / [最終検証](verification.json)

主128,000試合はサイクル16終了時の30枚・AIパラメータを固定した能力比較。能力を新しく使う選択処理だけ補完した。補助AI診断は主結果と分離し、自動最適化・新カード追加や検討・サイクル17・採用は行っていない。

CSVの勝率・差は0～1単位（0.01＝1ポイント）、レポートは%・pt表記。勝率差の正方向はCSVの対比定義に従う。対面表は左キャラの勝率。主比較の118検定を補正し、補助20比較は別の二次族。指標の観測値を媒介因果と断定しない。

能力活用度JSONには試合数、合計、1試合平均、Lv1〜5順の配列を保存する。要求対象のLv3〜5を中心に解釈する。飛鳥Lv2の内部ドローは未計測のためnull。柳生新版環境の維持されたLv2交換量は、実返却数から補完した。詳細はレポートとverification.json。

補助観測は同じseedの再生であり、独立した勝率根拠へ加算しない。生データと計算ハーネスはローカルに保持し、この資料一式だけで実行環境全体を提供するものではない。

元の438ファイルのハッシュを維持し、ゲーム本体・旧ルール・カードプール・既存デッキ・AI採用履歴・cycle_state.jsonを変更していない。研究用能力はワーカー内だけの一時定義。関連する[PR #8のキャッシュ問題](https://github.com/kokumotsu666/uvs-game/pull/8)には新規ワーカーで対応した。

保存先は `research/characters/ability_comparison_20261105/`。今後も研究ID別に保存して過去の資料を上書きしない。mainへマージしない。
