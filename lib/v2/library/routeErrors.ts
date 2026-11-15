import { NextResponse } from 'next/server';
import { BriefError } from './brief';
import { BriefValidationError } from './briefRules';
import { MomentError } from './moments';
import { ScriptError } from './scriptGenerate';

/** Map library domain errors to JSON responses; rethrow anything else. */
export function libraryErrorResponse(e: unknown): NextResponse {
  if (e instanceof BriefError) {
    return NextResponse.json(
      { error: e.message, code: e.code, ...(e.extra ?? {}) },
      { status: e.status },
    );
  }
  if (e instanceof BriefValidationError) {
    return NextResponse.json({ error: e.message, field: e.field }, { status: 400 });
  }
  if (e instanceof MomentError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof ScriptError) {
    return NextResponse.json(
      { error: e.message, code: e.code, ...(e.extra ?? {}) },
      { status: e.status },
    );
  }
  throw e;
}
