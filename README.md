# Snaky in 21

Play White against the Maker strategy from
[“Snaky in 21 Maker moves”](https://github.com/openai/math/blob/main/preprints/Snaky-in-21-Maker-moves-September-25-2026/article.pdf)
on a 19×19 Go board. Black always completes the Snaky hexomino; the game is how long you can make it take.

Open `index.html` in a browser. There is no build step and no server logic.

## Modes

- **Glass box**: see the active card's envelope, a heatmap of how much each reply delays Black,
  Black's hand of child cards (hover a point to see which cards it kills and which one Black switches to),
  and the proof path from card 727 down to a base card.
- **Blind**: no help. You win if Black needs all 21 moves. After the game, review it with the glass box.
- **Watch perfect defense**: White plays a reply that keeps the maximum delay every time; it always lasts exactly 21.

Below the board: *the squeeze* (Table 1 of the paper, the 32 children of card 727 intersecting down to the pivot)
and a browser for all 728 cards.

## How it works

- `js/certificate.js` is Appendix D verbatim (SHA-256 `3fa12d36…3d04`, matching the paper's verifier).
- `js/engine.js` rebuilds every card with the combination rule (2), then runs the policy of Section 4:
  claim the pivot, and after White's reply move to a surviving child card. By default Black picks the
  fastest surviving child; the options let you use the paper's literal "first surviving child" with replacement moves.
- For each card the engine also computes how many moves a perfect White can force against the policy.
  For all 728 cards this equals the certificate height, so 21 is tight for this strategy.

The paper's (0,0) maps to board point B2, so card 727's pivot (8,8) is tengen (K10).

## Checks

```
node tools/check.mjs      # rebuilds the certificate and compares with the paper's stated values
node tools/simulate.mjs   # plays random, envelope-only and perfect White against both policies
```
