export type PersonaExample = {
  learner: string;
  reply_tl: string;
  reply_ar: string;
};

export type Persona = {
  name: string;
  age: number;
  address: 'tu';
  address_examples: string;
  who: string;
  facts_tl: string[];
  style: string;
  examples: PersonaExample[];
};

export type PersonasFile = {
  target_lang: string;
  note?: string;
  personas: Record<string, Persona>;
};

export type ValidatePersonasResult = {
  ok: boolean;
  issues: string[];
  doc: PersonasFile | null;
};
