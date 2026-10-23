import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GradeRequestSchema, GradeResponseSchema, unclearGrade } from '../lib/grader/schema';
import { parseGradeModelOutput } from '../lib/grader/gradeAnswer';
import { buildV2ReactorPrompt } from '../lib/reactor/buildReactPrompt';
import { sanitizeReactorText } from '../lib/reactor/reactAnswer';
import { ReactRequestSchema } from '../lib/reactor/schema';
import { adaptMongoPack } from '../lib/lessons/adaptMongoPack';
import { validatePack } from '../lib/generation/validator';

describe('v2 grader schema', () => {
  it('accepts a valid speaking grade request', () => {
    const parsed = GradeRequestSchema.safeParse({
      skill: 'speaking',
      prompt_pt: 'Como te chamas?',
      answer: 'Chamo-me Omar.',
      accepted: ['Chamo-me [NAME].'],
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.mode, 'practice');
      assert.equal(parsed.data.answer_source, 'typed');
    }
  });

  it('caps errors at 3 and rejects invalid verdict', () => {
    const bad = GradeResponseSchema.safeParse({
      verdict: 'maybe',
      items_used_correctly: [],
      errors: [],
      main_error: null,
      corrected_tl: '',
      feedback_ar: '',
      skill: 'speaking',
    });
    assert.equal(bad.success, false);

    const many = GradeResponseSchema.safeParse({
      verdict: 'wrong',
      items_used_correctly: [],
      errors: [
        { category: 'grammar', scope: 'agreement', wrong: 'a', right: 'o' },
        { category: 'grammar', scope: 'verb_form', wrong: 'falo', right: 'falas' },
        { category: 'vocabulary', scope: 'wrong_word', wrong: 'bus', right: 'autocarro' },
        { category: 'spelling', scope: 'spelling', wrong: 'casa', right: 'casas' },
      ],
      main_error: 0,
      corrected_tl: 'x',
      feedback_ar: 'y',
      skill: 'writing',
    });
    assert.equal(many.success, false);
  });

  it('maps malformed model JSON to unclear', () => {
    const out = parseGradeModelOutput('not json at all', {
      mode: 'practice',
      level: 'A0',
      learner_gender: 'unknown',
      skill: 'speaking',
      prompt_pt: 'Olá',
      target_items: [],
      weak_areas: [],
      known_items: [],
      answer: 'Oi',
      answer_source: 'typed',
    });
    assert.equal(out.verdict, 'unclear');
    assert.equal(out.skill, 'speaking');
  });

  it('parses a valid model JSON blob', () => {
    const out = parseGradeModelOutput(
      JSON.stringify({
        verdict: 'near_miss',
        items_used_correctly: ['phrase.hello'],
        errors: [
          {
            category: 'vocabulary',
            scope: 'brazilian',
            wrong: 'ônibus',
            right: 'autocarro',
          },
        ],
        main_error: 0,
        corrected_tl: 'O autocarro.',
        feedback_ar: 'في البرتغال بنقول autocarro.',
        skill: 'speaking',
      }),
      {
        mode: 'practice',
        level: 'A0',
        learner_gender: 'm',
        skill: 'speaking',
        prompt_pt: 'O que é isto?',
        target_items: ['phrase.hello'],
        weak_areas: [],
        known_items: ['autocarro'],
        answer: 'O ônibus.',
        answer_source: 'typed',
      },
    );
    assert.equal(out.verdict, 'near_miss');
    assert.equal(out.errors.length, 1);
    assert.equal(out.main_error, 0);
  });

  it('unclearGrade helper echoes skill', () => {
    assert.equal(unclearGrade('writing').skill, 'writing');
    assert.equal(unclearGrade('writing').verdict, 'unclear');
  });
});

describe('v2 reactor', () => {
  it('practice prompt never asks for a VERDICT line', () => {
    const prompt = buildV2ReactorPrompt({
      mode: 'practice',
      level: 'A0',
      skill: 'speaking',
      verdict: 'wrong',
      prompt_pt: 'Bom dia',
      answer: 'Boa',
      corrected_tl: 'Bom dia.',
      main_error: {
        category: 'vocabulary',
        scope: 'forgot_word',
        wrong: 'Boa',
        right: 'Bom dia',
        feedback_ar: 'التحية كاملة: Bom dia.',
      },
      weak_spot: false,
      character_name: 'Rita',
      character_role: 'vizinha',
      reaction_cue: 'smiles',
      recent: [],
      reaction_kind: 'r2',
    });
    assert.match(prompt, /SOURCE is always code/);
    assert.match(prompt, /No VERDICT line/);
    assert.equal(/Line 1, exactly: VERDICT/i.test(prompt), false);
    assert.match(prompt, /Correct only MAIN_ERROR/);
  });

  it('daily / open_question / assessment modes are distinct', () => {
    const base = {
      level: 'A0' as const,
      skill: 'speaking' as const,
      verdict: 'correct' as const,
      prompt_pt: 'Oi',
      answer: 'Oi',
      corrected_tl: '',
      weak_spot: false,
      character_name: 'Inês',
      character_role: 'friend',
      reaction_cue: 'warm',
      recent: [],
      reaction_kind: 'r2' as const,
    };
    assert.match(buildV2ReactorPrompt({ ...base, mode: 'daily' }), /DAILY MODE/);
    assert.match(
      buildV2ReactorPrompt({ ...base, mode: 'open_question' }),
      /OPEN_QUESTION/,
    );
    assert.match(
      buildV2ReactorPrompt({ ...base, mode: 'assessment', verdict: 'wrong' }),
      /ASSESSMENT mode/,
    );
  });

  it('sanitizeReactorText strips accidental VERDICT lines', () => {
    const cleaned = sanitizeReactorText(
      'VERDICT: correct\n<character name="Rita"><pt>Ok.</pt><ar>تمام.</ar></character>',
    );
    assert.equal(/^VERDICT/m.test(cleaned), false);
    assert.match(cleaned, /<character/);
  });

  it('validates react request schema', () => {
    const ok = ReactRequestSchema.safeParse({
      verdict: 'correct',
      answer: 'Sim.',
      skill: 'writing',
    });
    assert.equal(ok.success, true);
  });
});

describe('v2 beat skill adapt + pack validate', () => {
  it('defaults missing skill to speaking when adapting Mongo packs', () => {
    const pack = adaptMongoPack({
      lesson_key: 'pl-test',
      cefr_level: 'A0',
      spec: { title_ar: 'اختبار', target: 'test' },
      pack: {
        intro_ar: 'مقدمة',
        intro_arz: 'مُقَدِّمَة',
        character: { name: 'Rita', role_ar: 'جارة' },
        scenes: [{ id: 's01', title_ar: 'مشهد' }],
        beats: [
          {
            id: 'b01',
            scene: 's01',
            speaker: 'Rita',
            difficulty: 'guided',
            kind: 'known',
            reaction_cue: 'smiles',
            line: {
              pt: 'Olá!',
              ar: 'أهلاً',
              arz: 'أَهْلاً',
              alt_pt: 'Oi!',
              alt_ar: 'هاي',
              alt_arz: 'هاي',
            },
            accepted: ['Olá'],
            coach_tip: { ar: 'قول أهلاً', arz: 'قول أهلاً' },
            frame: 'Olá …',
            word_bank: [{ pt: 'olá', ar: 'أهلاً' }],
          },
        ],
        closing_hook: {
          speaker: 'Rita',
          pt: 'Tudo bem?',
          ar: 'كويس؟',
          arz: 'كويس؟',
        },
        assessment: [
          {
            id: 'a01',
            target: 'تحية',
            kind: 'known',
            line: { pt: 'Olá!', ar: 'أهلاً', arz: 'أَهْلاً' },
            accepted: ['Olá'],
          },
        ],
      },
    });
    assert.ok(pack);
    assert.equal(pack!.beats[0].skill, 'speaking');
  });

  it('hard-fails listening without options and reading without artifact', () => {
    const baseBeat = {
      id: 'b01',
      scene: 's01',
      speaker: 'Rita',
      difficulty: 'guided',
      kind: 'known',
      reaction_cue: 'smiles warmly',
      line: {
        pt: 'Olá!',
        ar: 'أهلاً',
        arz: 'أَهْلاً',
        alt_pt: 'Oi!',
        alt_ar: 'هاي',
        alt_arz: 'هاي',
      },
      accepted: ['Olá'],
      coach_tip: { ar: 'قول أهلاً', arz: 'قول أهلاً' },
      frame: 'Olá …',
      word_bank: [
        { pt: 'olá', ar: 'أهلاً' },
        { pt: 'oi', ar: 'هاي' },
        { pt: 'bom dia', ar: 'صباح الخير' },
      ],
      hint_note: { ar: 'جرّب تاني.', arz: 'جرّب تاني.' },
      why_note: { ar: 'الإجابة Olá.', arz: 'الإجابة Olá.' },
    };

    const listening = validatePack({
      intro_ar: 'مقدمة',
      character: { name: 'Rita', role_ar: 'جارة' },
      scenes: [{ id: 's01', title_ar: 'مشهد', words: [] }],
      beats: [{ ...baseBeat, skill: 'listening' }],
      closing_hook: { speaker: 'Rita', pt: 'Tudo bem?', ar: 'كويس؟', arz: 'كويس؟' },
      assessment: [
        {
          id: 'a01',
          target: 'يسلّم',
          speaker: 'assessment',
          kind: 'known',
          line: { pt: '', ar: 'قول أهلاً', arz: 'قول أهلاً' },
          accepted: ['Olá'],
          anticipated_wrong: [],
          nudge_note: { ar: 'جرّب', arz: 'جرّب' },
          why_note: { ar: 'Olá', arz: 'Olá' },
        },
      ],
    });
    assert.equal(listening.ok, false);
    assert.ok(
      listening.errors.some((e: { code: string }) => e.code === 'missing_listening_options'),
    );

    const reading = validatePack({
      intro_ar: 'مقدمة',
      character: { name: 'Rita', role_ar: 'جارة' },
      scenes: [{ id: 's01', title_ar: 'مشهد', words: [] }],
      beats: [{ ...baseBeat, skill: 'reading' }],
      closing_hook: { speaker: 'Rita', pt: 'Tudo bem?', ar: 'كويس؟', arz: 'كويس؟' },
      assessment: [
        {
          id: 'a01',
          target: 'يسلّم',
          speaker: 'assessment',
          kind: 'known',
          line: { pt: '', ar: 'قول أهلاً', arz: 'قول أهلاً' },
          accepted: ['Olá'],
          anticipated_wrong: [],
          nudge_note: { ar: 'جرّب', arz: 'جرّب' },
          why_note: { ar: 'Olá', arz: 'Olá' },
        },
      ],
    });
    assert.equal(reading.ok, false);
    assert.ok(
      reading.errors.some((e: { code: string }) => e.code === 'missing_reading_artifact'),
    );
  });

  it('accepts a listening beat with options', () => {
    const result = validatePack({
      intro_ar: 'مقدمة',
      character: { name: 'Rita', role_ar: 'جارة' },
      scenes: [{ id: 's01', title_ar: 'مشهد', words: [] }],
      beats: [
        {
          id: 'b01',
          scene: 's01',
          speaker: 'Rita',
          difficulty: 'guided',
          kind: 'known',
          skill: 'listening',
          reaction_cue: 'smiles warmly',
          line: {
            pt: 'São dois euros.',
            ar: 'يورو اتنين',
            arz: 'يورو اتنين',
            alt_pt: 'Dois euros.',
            alt_ar: 'يورو اتنين',
            alt_arz: 'يورو اتنين',
          },
          accepted: ['São dois euros.'],
          listening_options: [
            { id: 'a', tl: 'São dois euros.', correct: true },
            { id: 'b', tl: 'É um euro.', correct: false },
            { id: 'c', tl: 'São cinco euros.', correct: false },
          ],
          coach_tip: { ar: 'اسمع السعر', arz: 'اسمع السعر' },
          frame: '…',
          word_bank: [
            { pt: 'dois', ar: 'اتنين' },
            { pt: 'euros', ar: 'يورو' },
            { pt: 'são', ar: 'هو/هم' },
          ],
          hint_note: { ar: 'جرّب تاني.', arz: 'جرّب تاني.' },
          why_note: { ar: 'São dois euros.', arz: 'São dois euros.' },
        },
      ],
      closing_hook: { speaker: 'Rita', pt: 'Tudo bem?', ar: 'كويس؟', arz: 'كويس؟' },
      assessment: [
        {
          id: 'a01',
          target: 'يفهم السعر',
          speaker: 'assessment',
          kind: 'known',
          line: { pt: '', ar: 'بكام؟', arz: 'بكام؟' },
          accepted: ['São dois euros.'],
          anticipated_wrong: [],
          nudge_note: { ar: 'جرّب', arz: 'جرّب' },
          why_note: { ar: 'سعر', arz: 'سعر' },
        },
      ],
    });
    assert.equal(
      result.errors.some((e: { code: string }) => e.code === 'missing_listening_options'),
      false,
    );
  });
});

describe('v2 agent auth helpers', () => {
  it('requireAgentSecret rejects missing secret config', async () => {
    const prev = process.env.AGENT_SHARED_SECRET;
    delete process.env.AGENT_SHARED_SECRET;
    const { requireAgentSecret } = await import('../lib/agentAuth');
    const res = requireAgentSecret(new Request('http://localhost/api/grade'));
    assert.ok(res);
    assert.equal(res!.status, 503);
    if (prev !== undefined) process.env.AGENT_SHARED_SECRET = prev;
  });

  it('requireAgentSecret rejects bad secret', async () => {
    process.env.AGENT_SHARED_SECRET = 'test-secret';
    const { requireAgentSecret } = await import('../lib/agentAuth');
    const res = requireAgentSecret(
      new Request('http://localhost/api/grade', {
        headers: { 'x-agent-secret': 'wrong' },
      }),
    );
    assert.ok(res);
    assert.equal(res!.status, 401);

    const ok = requireAgentSecret(
      new Request('http://localhost/api/grade', {
        headers: { 'x-agent-secret': 'test-secret' },
      }),
    );
    assert.equal(ok, null);
  });
});
