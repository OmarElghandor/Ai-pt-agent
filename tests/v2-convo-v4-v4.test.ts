import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  oneChatOpeningFrame,
  openingChipsForLevel,
} from '@/lib/v2/convo/topics/openingChips';
import { TEACH_CHIP_LABEL_EG } from '@/lib/v2/convo/topics/allowed';
import {
  buildOpenOpeningBubbles,
  openModeOpeningFrame,
} from '@/lib/v2/convo/session/freeInit';
import { OPEN_TOPIC } from '@/lib/v2/convo/topics';

describe('conversations v4 · V4 opening chips', () => {
  it('level 1 opening is exactly 3 chips including introductions and directions (هنتعلمه)', () => {
    const chips = openingChipsForLevel(1);
    assert.equal(chips.length, 3, JSON.stringify(chips.map((c) => c.topic_id)));
    const ids = chips.map((c) => c.topic_id);
    assert.ok(ids.includes('day-1'), JSON.stringify(ids));
    assert.ok(ids.includes('direcoes'), JSON.stringify(ids));
    const dir = chips.find((c) => c.topic_id === 'direcoes');
    assert.equal(dir?.above_level, true);
    assert.equal(dir?.badge_eg, TEACH_CHIP_LABEL_EG);

    const frame = oneChatOpeningFrame(1);
    assert.equal(frame.chips.length, 3);
    assert.ok(
      frame.chips.some((c) => c.includes('هنتعلمه') || /[Dd]ire/.test(c)),
    );
    assert.deepEqual(openModeOpeningFrame(1).chips, frame.chips);
  });

  it('opening uses Olá, {name}! and Egyptian coach', () => {
    assert.match(OPEN_TOPIC.opening_tl, /^Olá, \{name\}!/);
    const bubbles = buildOpenOpeningBubbles({
      topic: OPEN_TOPIC,
      learnerName: 'Omar',
    });
    assert.match(bubbles.character.tl, /^Olá, Omar!/);
    assert.match(bubbles.character.tl, /Sobre o que queres falar hoje\?/);
    assert.ok(bubbles.coach_intros[0]?.coach_intro_eg.trim());
  });
});
