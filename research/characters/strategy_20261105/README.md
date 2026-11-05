# キャラ能力からの勝ち筋・構築方針調査

- [日本語研究レポート](research_report.md)：5キャラのLv1～5、各3勝ち筋、役割・GP・手札・AI、新カードを検討する条件、今後の実験順序
- [参照スナップショット](source_snapshot.json)：サイクル16の能力定義・実効AI・66枚のカード情報・ソースハッシュ・公開mainとの静的比較
- [15案の計画データ](strategy_plan.json)
- [合法30枚の静的な成立例](construction_witnesses.json)：採用案・調整結果ではない
- [検査記録](verification.json)

今回は対戦・自動調整・AI判断・採用を実行していない。構成例の検査は、カード名・同名3枚・専用制限・30枚の静的な検査のみ。現行デッキや状態に書き戻していない。

参照研究：[PR #6](https://github.com/kokumotsu666/uvs-game/pull/6)、[PR #7](https://github.com/kokumotsu666/uvs-game/pull/7)、[PR #8](https://github.com/kokumotsu666/uvs-game/pull/8)。未マージの研究資料はそれぞれのコミットへ固定したリンクで参照する。

今後は `research/characters/<研究ID>/` に研究単位で資料を追加し、この調査は上書きしない。ゲーム本体・カード・AI・既存デッキ・状態・採用履歴を変更せず、mainへマージしない。
