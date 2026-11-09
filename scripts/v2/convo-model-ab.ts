#!/usr/bin/env npx tsx
/**
 * Play golden conversation scripts against Qwen and Haiku side by side.
 * Full golden harness lands in V8; this prints stubbed parallel transcripts.
 *
 *   npx tsx scripts/v2/convo-model-ab.ts
 */
import { parseConvoModelSpec } from '@/lib/model';

const GOLDENS = [
  { id: 'g1-intro', level: 1, title: 'Level 1 introductions' },
  { id: 'g2-direcoes', level: 1, title: 'Level 1 directions (teach)' },
  { id: 'g3-casa', level: 20, title: 'Level 20 casa' },
  { id: 'g4-futebol', level: 20, title: 'Level 20 futebol' },
] as const;

function main() {
  const qwen = parseConvoModelSpec('qwen');
  const haiku = parseConvoModelSpec('haiku');
  console.log('V2_CONVO_MODEL A/B — models resolved:');
  console.log(`  Qwen:  ${qwen.provider}:${qwen.modelId}`);
  console.log(`  Haiku: ${haiku.provider}:${haiku.modelId}`);
  console.log('');
  console.log(
    'Golden list (run live turns via V8 harness against each model):',
  );
  for (const g of GOLDENS) {
    console.log(`  - ${g.id} · L${g.level} · ${g.title}`);
  }
  console.log('');
  console.log(
    'Tip: set V2_CONVO_MODEL=haiku (or convo_model in the turn body) and compare transcripts.',
  );
}

main();
