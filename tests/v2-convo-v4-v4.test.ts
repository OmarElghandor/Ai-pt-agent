import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { oneChatOpeningFrame, openingChipsForLevel } from '@/lib/v2/convo/topics/openingChips';
import { TEACH_CHIP_LABEL_EG } from '@/lib/v2/convo/topics/allowed';
import { openModeOpeningFrame } from '@/lib/v2/convo/session/freeInit';

describe('conversations v4 · V4 opening chips', () => {
  it('level 1 opening includes introductions and directions (هنتعلمه)', () => {
    const chips = openingChipsForLevel(1);
    const ids = chips.map((c) => c.topic_id);
    assert.ok(ids.includes('day-1'), JSON.stringify(ids));
    assert.ok(ids.includes('direcoes'), JSON.stringify(ids));
    const dir = chips.find((c) => c.topic_id === 'direcoes');
    assert.equal(dir?.above_level, true);
    assert.equal(dir?.badge_eg, TEACH_CHIP_LABEL_EG);

    const frame = oneChatOpeningFrame(1);
    assert.ok(frame.chips.some((c) => c.includes('هنتعلمه') || /[Dd]ire/.test(c)));
    assert.deepEqual(openModeOpeningFrame(1).chips, frame.chips);
  });
});
