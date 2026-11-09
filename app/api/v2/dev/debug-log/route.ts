import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

const LOG_PATH = path.join(
  process.cwd(),
  '.cursor',
  'debug-7ecc67.log',
);

/** Dev-only NDJSON sink so client instrumentation reaches the debug log file. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    await mkdir(path.dirname(LOG_PATH), { recursive: true });
    await appendFile(LOG_PATH, `${JSON.stringify(body)}\n`, 'utf8');
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
