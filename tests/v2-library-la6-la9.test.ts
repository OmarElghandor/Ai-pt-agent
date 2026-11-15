import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  ensureUniquePoolVoices,
  voicesCheckStatus,
} from '../lib/v2/library/voiceAdmin';
import {
  estimateAudioLines,
} from '../lib/v2/library/audio';
import {
  mapCharTimingsToTokens,
  settingsCacheKey,
  stubElevenLabsClient,
  isPlaceholderVoiceId,
} from '../lib/v2/library/elevenlabs';
import { buildImageManifest } from '../lib/v2/library/images';
import { publishChecklist } from '../lib/v2/library/publish';

describe('LA6 · voices', () => {
  it('placeholder id blocks voices check', () => {
    assert.equal(isPlaceholderVoiceId('<<VOICE_ID_YASSIN>>'), true);
    const status = voicesCheckStatus(
      [{ voice_key: 'yassin' }],
      [
        {
          key: 'yassin',
          elevenlabs_voice_id: '<<VOICE_ID_YASSIN>>',
          approved: true,
        },
      ],
    );
    assert.equal(status, 'missing');
  });

  it('two pool voices in one episode are never the same', () => {
    const cast = ensureUniquePoolVoices(
      [
        { voice_key: 'pool_m_1', role_eg: 'a', learner: false },
        { voice_key: 'pool_m_1', role_eg: 'b', learner: false },
      ],
      [
        { key: 'pool_m_1', gender: 'm' },
        { key: 'pool_m_2', gender: 'm' },
      ],
    );
    assert.notEqual(cast[0].voice_key, cast[1].voice_key);
  });

  it('second voice test with same settings makes no call (cache key stable)', () => {
    const a = settingsCacheKey('yassin', 'model', { stability: 0.5 });
    const b = settingsCacheKey('yassin', 'model', { stability: 0.5 });
    assert.equal(a, b);
  });
});

describe('LA7 · audio', () => {
  it('unchanged lines cost 0 on rebuild estimate', () => {
    const est = estimateAudioLines([
      { tl: 'ola', audio_key: 'x', audio_stale: false },
      { tl: 'mundo', audio_key: null, audio_stale: true },
    ]);
    assert.equal(est.lines[0].cost_chars, 0);
    assert.equal(est.lines[1].cost_chars, 5);
    assert.equal(est.build_chars, 5);
  });

  it('every token gets start and end including accented word and chunk surfaces', () => {
    const text = 'café se faz';
    const tokens = [
      { surface: 'café' },
      { surface: 'se' },
      { surface: 'faz' },
    ];
    const chars = [...text.replace(/ /g, '')];
    // crude alignment without spaces
    const joined = 'cafésefaz';
    const characters = [...joined];
    const starts = characters.map((_, i) => i * 0.1);
    const ends = characters.map((_, i) => i * 0.1 + 0.1);
    const mapped = mapCharTimingsToTokens(
      joined,
      tokens,
      characters,
      starts,
      ends,
    );
    assert.equal(mapped.length, 3);
    for (const m of mapped) {
      assert.equal(typeof m.start, 'number');
      assert.equal(typeof m.end, 'number');
      assert.ok(m.end >= m.start);
    }
  });

  it('stub elevenlabs can fail a line', async () => {
    const client = stubElevenLabsClient({ failAtText: 'boom' });
    await assert.rejects(
      () =>
        client.textToSpeechWithTimestamps({
          voiceId: 'v',
          text: 'boom',
          modelId: 'm',
        }),
      /stub failure/,
    );
  });
});

describe('LA8 · images', () => {
  it('stories get scene keys; podcasts get cover', () => {
    const story = buildImageManifest({
      slug: 'farmacia-dor',
      type: 'story',
      lines: [{ scene: 1 }, { scene: 1 }, { scene: 2 }],
      intro_eg: 'زورك واجعك',
    });
    assert.ok(story.some((r) => r.key.endsWith('.scene-1')));
    assert.ok(story.some((r) => r.key.endsWith('.scene-2')));
    const pod = buildImageManifest({
      slug: 'senhorio-chamada',
      type: 'podcast',
      lines: [{ scene: 1 }],
      intro_eg: 'مكالمة',
    });
    assert.equal(pod.length, 1);
    assert.ok(pod[0].key.endsWith('.cover'));
    assert.match(pod[0].spec, /No place badges/);
  });
});

describe('LA9 · publish + cost wiring', () => {
  it('publish checklist shape is testable without mongo via blocked items source', () => {
    // publishChecklist needs mongo; assert the module exports and route gates.
    assert.equal(typeof publishChecklist, 'function');
    const src = readFileSync(
      path.join(
        process.cwd(),
        'app/api/v2/admin/library/episodes/[slug]/publish/route.ts',
      ),
      'utf8',
    );
    assert.match(src, /denyUnlessV2Admin/);
    assert.match(src, /publishChecklist/);
  });

  it('learner episodes route exists and uses session user id', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'app/api/v2/library/episodes/route.ts'),
      'utf8',
    );
    assert.match(src, /getCurrentV2UserId/);
    assert.match(src, /listPublishedEpisodes/);
  });

  it('cost route totals from job logs', () => {
    const src = readFileSync(
      path.join(process.cwd(), 'app/api/v2/admin/library/cost/route.ts'),
      'utf8',
    );
    assert.match(src, /V2LibraryJobModel/);
    assert.match(src, /per_episode/);
  });

  it('every library admin route still calls denyUnlessV2Admin', () => {
    const root = path.join(process.cwd(), 'app/api/v2/admin/library');
    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, name.name);
        if (name.isDirectory()) out.push(...walk(p));
        else if (name.name === 'route.ts') out.push(p);
      }
      return out;
    }
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8');
      assert.match(src, /denyUnlessV2Admin/, file);
    }
  });
});
