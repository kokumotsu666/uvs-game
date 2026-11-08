# UVS character illustration integration (draft)

## Scope
- UI only; game rules, AI, card data, turn state, logs and replay behavior are unchanged.
- All levels 1-5 of each character share one transparent illustration.
- The existing HTML card name, level, AT/DF, and ability text remain displayed.
- If an image file is missing, its <img> is removed and the previous text-only card remains.

## Required images (not yet committed)
Please add the *approved* WebP files from the ChatGPT asset package to this branch, with the exact paths:

- assets/characters/asuka.webp (飛鳥: short sleeves, two separate swords)
- assets/characters/ikaruga.webp (斑鳩)
- assets/characters/katsuragi.webp (葛城)
- assets/characters/yagyu.webp (柳生)
- assets/characters/hibari.webp (雲雀: pink + iris patterns)

Do **not** replace files with older intermediate drafts or combine images into one. The package is named `uvs_character_private_package.zip`. Extract it outside the repository, verify the five images, then copy only the five `*.webp` files into `assets/characters/` in this branch. Binary assets were not uploaded from ChatGPT in this step.

## Test and release checklist
1. Inspect all five character views at levels 1, 3 and 5 (including when they appear on either side and when the opponent is flipped).
2. Test damage (level up) and milk healing (level down), both with art present and with an image deliberately renamed/missing.
3. Verify long text/abilities, action prompts, tap-to-select, gauges, battle techniques and heavy displays remain legible on 375px / 390px mobile widths.
4. Run same-seed replay/state comparisons against the current production simulator; record results and screenshots.
5. Compare with the latest local v1.11 HTML, especially any newer UI/replay modifications not present in main. Rebase/port carefully; never overwrite the latest standalone HTML with an older branch version.
6. Merge only after assets are present and tests pass. GitHub Pages serves public assets after merge.

This is a staging branch. The published GitHub Pages site stays unchanged until merge.
