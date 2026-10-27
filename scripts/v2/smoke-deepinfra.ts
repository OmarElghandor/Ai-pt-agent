import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { callClaudeJson, zodToolSchema } from '@/lib/generation/claudeClient';

function loadEnvFile(name: string) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');
process.env.V2_GEN_PROVIDER = 'deepinfra';
process.env.V2_GEN_MODEL =
  process.env.V2_GEN_MODEL || process.env.DEEPINFRA_MODEL || 'Qwen/Qwen3-32B';

async function main() {
  const Schema = z.object({ hello: z.string(), n: z.number() });
  const result = await callClaudeJson(
    '',
    'Return hello="world" and n=1 via the tool. Call submit_smoke once.',
    {
      label: 'smoke',
      maxTokens: 256,
      tool: {
        name: 'submit_smoke',
        description: 'Smoke test payload',
        inputSchema: zodToolSchema(Schema),
      },
    },
  );
  console.log(
    JSON.stringify(
      {
        model: result.model,
        data: result.data,
        ms: result.durationMs,
        usage: result.usage,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
