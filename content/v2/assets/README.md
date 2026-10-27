# v2 image assets

Place these files before generating images:

- `style-anchor.png` — Warm Storybook style reference (required for object/place images)
- `characters/yassin.png`, `ines.png`, `rita.png`, `manuel.png`, `sofia.png`, `carlos.png` — character reference sheets

Without character refs, character-bearing `image_spec`s are skipped and flagged.
Without the style anchor, non-character images are skipped and flagged.

Generated images land in `data/v2-images/{key}.png`. Keys are recorded in `index.json`.
