# Frequency data for W1 (17-item-weights)

Two files, built 2026-11-23 by Claude. No hand-written ranks.

## 1000-palavras.json (1,100 entries)

Parsed from the PDF "1000 Palavras Portuguesas Mais Comuns" (portuguesewithleo.com).

- **The PDF is thematic, not ranked.** Words are numbered inside each category (food, family, verbs…), so the PDF number is NOT a frequency rank. `list_index` is only the order in the PDF.
- Fields: `section`, `subsection`, `tl`, `en`, `list_index`, `from_table` (closed-class words taken from the PDF's tables: articles, contractions, pronouns, possessives, demonstratives, colours, numbers), and three joined fields:
  - `freq_rank`: the rank from `pt-PT-frequency-5000.json` (single word), or the rank of the rarest content word for an expression. Empty for 14 entries not found in the corpus (o estendal, a tábua de engomar, o lava-loiças…).
  - `freq_rank_method`: `single_word` | `rarest_word_of_expression`.
  - `freq_heads`: the words used for the lookup.
- Coverage: 429 entries are in the top 500 lemmas, 618 in the top 1,000, 918 in the top 3,000.

## pt-PT-frequency-5000.json (top 5,000 lemmas)

- Source: OpenSubtitles 2018, European-Portuguese subtitles (`pt`, not `pt_br`), from hermitdave/FrequencyWords (MIT licence). The top 25,000 word forms were lemmatised and summed by lemma. Subtitles are spoken, everyday language, which fits the app.
- Fields: `lemma`, `rank`, `count`, `forms` (the word forms merged into it), `variant`, `in_palavras`.
- `variant`:
  - `pt`: found in the LibreOffice pt-PT dictionary;
  - `not_in_pt_dictionary`: names (henry, maria), old spellings (aspecto, excepto), Brazilian forms (pra), interjections (uh, uau), or lemmatiser mistakes;
  - `vulgar`: swear words.
- Known limits (automatic list, review in the admin curriculum view):
  - a few lemmatiser mistakes (bolsar, basto, defeso, charlar, petar, califórnio);
  - "foi / fui / foram" are counted under `ser/ir` because the form is shared.

## How W1 uses them

- `freq_rank` of a core item = the `rank` of its main word's lemma in `pt-PT-frequency-5000.json`. For phrases, the rarest content word (same rule as `freq_rank_method`).
- Only `variant: pt` entries are used for points. The others are ignored.
- An item not in the list but present in `1000-palavras.json` gets the 1,501–3,000 band (+6), so curated everyday words (o estendal) aren't scored as rare.
- The admin "coverage of the frequency list" view uses `in_palavras` and the rank to show which of the top 1,000 / 3,000 lemmas the curriculum is still missing.
