# Snaky in 21

Play White against the Maker strategy from
[“Snaky in 21 Maker moves”](https://github.com/openai/math/blob/main/preprints/Snaky-in-21-Maker-moves-September-25-2026/article.pdf)
on a 19×19 Go board. Black always completes the Snaky hexomino; the game is how long you can make it take.

Open `index.html` in a browser. It starts in Blind mode. There is no build step and no server logic.

## Modes

- **Glass box**: see the active card's envelope, a heatmap of how much each reply delays Black,
  Black's hand of child cards (hover a point to see which cards it kills and which one Black switches to),
  and the proof path from card 727 down to a base card.
- **Blind**: no help. You win if Black needs all 21 moves. After the game, review it with the glass box.
- **Review**: after a game (or any time in glass box), click a move in the record or press ← →; *Resume from here* rewinds and lets you try another reply.
- **Tempo graph**: after the game, a step chart of the perfect-defense finishing move after each reply; click it to review that reply.
- **SGF**: copy the game, or paste one and load it (White's moves are replayed; Black answers with this strategy).
- **Watch perfect defense**: White plays a reply that keeps the maximum delay every time; it always lasts exactly 21.

Below the board: *the squeeze* (Table 1 of the paper, the 32 children of card 727 intersecting down to the pivot)
and a browser for all 728 cards.

## Snaky in 20

`twenty/` (served at `/twenty/`) is the same app playing an improved certificate, `js/certificate20.js`: the paper's
722 lines plus 30 new cards, final card 757 with height 20. Black always wins within 20 moves, and within 18 after a
diagonal or knight's-move first reply. The cards come from the search in `research/snaky20` on the
`claude/research-snaky-20` branch and pass the paper's own verifier; they are a draft, not yet reviewed.
`twenty/index.html` is generated from `index.html` by `node tools/make-twenty.mjs`.

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

## Hosting

Any static host works; there is no build step. For GitHub Pages: Settings → Pages → Deploy from a branch → root.
`index.html` carries Open Graph tags pointing at `https://kaiasage.github.io/snaky-demo/assets/og.png` for link
previews; change those URLs if you host elsewhere. `tools/make-og-image.mjs` regenerates the image (needs Playwright).

## Playing from a terminal (or letting an agent play)

`tools/play-blind.mjs` is a text version of Blind mode: it shows only the stones, one move per call.

```
node tools/play-blind.mjs game.json        # show the board; a missing file starts a new game
node tools/play-blind.mjs game.json K11    # play White at K11, Black replies
node tools/play-blind.mjs game.json --sgf  # export, then paste into the page's SGF box to review
```

To have an AI agent play blind, give it the rules and this command, and ask it not to read any files in the repo:
the certificate and engine sit next to the harness, so playing blind is on the honour system. A Claude subagent
playing three games this way scored 13, 9 and 11.

## Playing over plain HTTP

`worker/` is a Cloudflare Worker for agents that can fetch URLs but can't run code: each GET returns the board as
text plus a link for every legal reply. See [worker/README.md](worker/README.md) for routes and deployment.

## Credits

The proof and certificate are from “Snaky in 21 Maker moves” (OpenAI, 2026), produced by an unreleased OpenAI model.
The card method descends from Nándor Sieben's proof trees for weak achievement games. See the page footer for the
earlier work on Snaky by Harary, Harborth and Seemann, Halupczok and Schlage-Puchta, Ito and Miyagawa,
Csernenszky, Martin and Pluhár, and others. This demo was built by Claude (Anthropic) in Claude Code.
