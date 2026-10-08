# Snaky in 20 (draft, unreviewed)

The paper's certificate proves that Maker completes Snaky within 21 moves. This folder extends that
certificate to a **20-move** one, checked by the paper's own verifier.

**Status: computer-checked here, not reviewed by anyone else. Please don't cite it yet.**

## The result

`certificate20.txt` is the paper's certificate (722 lines, byte for byte, SHA-256 3fa12d36…3d04)
followed by 779 new cards, numbered 728 to 1506. Card 1506 requires nothing (A = ∅) and has height 20. By
the paper's Lemma 3 and Theorem 1 argument, that means Maker has a strategy that completes Snaky within
**20** Maker moves against any Breaker play on the infinite board.

Its envelope is exactly card 727's 251 cells, so, as in the paper's Corollary 6, the same bound holds on a
17×17 board and Maker never needs to leave those 251 cells.

## What changed in the strategy

One rule on top of the paper's plan: **if Maker can complete Snaky with this stone, it does.** The paper's
policy only plays its current card's next stone and can leave a ready win on the board for many moves.
Every line of play that reaches 21 against the plan passes over such a win at some point, so taking
them saves a move.

Adding "make a double threat if one exists" (win-in-2) does not improve on 20, and neither does win-in-3
or chains of forcing threats: on the line that forces 20, none of them is available before the plan
itself is that close to finishing.

## Why you don't have to trust the search

The search only *finds* the new cards. Their correctness rests on the paper's own machinery:

- Each new card is an ordinary combination in the paper's format: a pivot plus child cards. The children
  are existing cards in some placement, base cards (a win-in-1), copies of the paper's own inline
  expressions as numbered cards (8 of them, text unchanged), or other new cards.
- `verify20.py` runs the verifier printed in Appendix G (`paper_verify.py`) with exactly two edits, which
  it prints: the coordinate alphabet runs past `G` (the first 17 symbols keep their values), because the
  new cards live in a wider frame; and the closing assertions check the new final card instead of 727.
- If the search had grouped White's replies wrongly, some empty point would sit in every child's envelope,
  the combination rule would put it into the card's required set, and the final card would not come out
  with A = ∅. So a wrong search fails the check instead of producing a wrong proof.

`paper_verify.py` was copied from the PDF's text. Spacing aside, it is the printed code; it accepts the
paper's certificate unchanged.

## Files

| File | What it does |
|---|---|
| `prove.mjs` | Search: proves (or refutes) "the plan plus win-in-1 finishes by move N" against every White play. `node prove.mjs 20` proves, `node prove.mjs 19` refutes. |
| `make-certificate.mjs` | Turns the N = 20 proof into new cards and writes `certificate20.txt`. |
| `verify20.py` | The paper's verifier, two edits, run on `certificate20.txt`. |
| `check20.mjs` | Independent check with this repo's JavaScript engine: loads the new final card, recomputes every card, computes the exact depth a perfect Breaker can force (20), and plays 900 games. |
| `lib.mjs`, `symbols.mjs` | Shared helpers. |
| `paper_verify.py` | Appendix G's `verify`, as printed. |

```
node prove.mjs 20
node make-certificate.mjs
python3 verify20.py
node check20.mjs
```

## How the search groups White's replies

At a position with White to move, the search tries every empty point in the envelope of a card in Black's
current hand individually. Any other reply leaves all of those cards alive, so Black keeps its fastest one;
if that card already finishes in time, those replies need nothing more. Otherwise the search also tries every
point of the certificate's 17×17 box grown by 4 (any Snaky with 4 or more Black stones lies inside it),
plus one far-away reply standing for the rest. For N = 20 that fallback never triggers.

## The certificate the site plays

`certificate20-best.txt` (final card 757, 30 new cards) is the one behind https://kaiasage.github.io/snaky-demo/twenty/.
It adds two single-stone cards of height 17 (738 and 749), found by `pns.mjs` for the diagonal and knight's-move first
replies, so those games end by move 18; only the four adjacent first replies still take 20. Built with
`EXTRA_CARDS=partial19-cards.txt node pns.mjs 20 50000 40 certificate20-best.txt` and checked with
`python3 verify20.py certificate20-best.txt 20`.

## Toward 19

The plan plus win-in-1 is refuted at 19, and no shortcut of depth ≤ 3 helps on the refuting line. About
10,000 positions and 252 complete lines keep the plan at 20; from White's 8th move on most of them are forced
corridors. Getting to 19 needs Black to choose differently earlier, for example by switching to another card
of the certificate that already covers the position, and proving each such deviation the same way.
