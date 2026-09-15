import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { getChatModel } from '@/lib/model';
import {
  stripThinkBlocks,
  trimToLastCompleteSegment,
} from '@/lib/parseTaggedMessage';
import { buildSystemPrompt, type CefrLevel } from '@/lib/prompts';
import {
  appendMessage,
  getOrCreateSession,
} from '@/lib/sessions';
import { structuredLog } from '@/lib/structuredLog';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_LEVELS: CefrLevel[] = ['A0', 'A1', 'A2', 'B1'];

function textFromUIMessage(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    message,
    sessionId,
    level: rawLevel,
  }: {
    message: UIMessage;
    sessionId: string;
    level?: string;
  } = body;

  if (!message || !sessionId) {
    return new Response(JSON.stringify({ error: 'message and sessionId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const level: CefrLevel = VALID_LEVELS.includes(rawLevel as CefrLevel)
    ? (rawLevel as CefrLevel)
    : 'A0';

  const session = getOrCreateSession(sessionId, level);
  const userText = textFromUIMessage(message);

  // Persist user turn immediately
  appendMessage(sessionId, { role: 'user', content: userText });

  const historyForModel = session.messages.map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  // Build UIMessage list for convertToModelMessages (exclude the just-added user
  // from double-counting: session already has it; message is the same turn)
  const uiMessages: UIMessage[] = [
    ...session.messages.slice(0, -1).map((m, i) => ({
      id: `hist-${i}`,
      role: m.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: m.content }],
    })),
    message,
  ];

  const system = buildSystemPrompt(level);

  const result = streamText({
    model: getChatModel(),
    system,
    messages: await convertToModelMessages(uiMessages),
    temperature: 0.6,
    maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS) || 600,
  });

  // Ensure stream completes even if client disconnects
  void result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: uiMessages,
      onEnd: ({ responseMessage }) => {
        let assistantText = stripThinkBlocks(textFromUIMessage(responseMessage));
        // Persist only complete tag pairs — UI still shows the full stream
        const forHistory = trimToLastCompleteSegment(assistantText);
        appendMessage(sessionId, { role: 'assistant', content: forHistory });

        console.log('[api/chat] generated content (raw):', assistantText);
        console.log('[api/chat] generated content (history):', forHistory);

        structuredLog({
          sessionId,
          userText,
          assistantText: forHistory,
          level,
        });

        // Silence unused — historyForModel kept for debugging clarity
        void historyForModel;
      },
    }),
  });
}
