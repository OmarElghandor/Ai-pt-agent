export type ConvoSelectKind =
  | 'candidates'
  | 'help'
  | 'recap'
  | 'closing'
  | 'empty';

export type ConvoSelectQKind = 'choice' | 'open' | 'recap';

export type ConvoSelectCandidate = {
  id: string;
  tl: string;
  item_id: string;
  qkind: ConvoSelectQKind;
};

export type ConvoSelectHelp = {
  question_id: string;
  item_id: string;
  step: 1 | 2 | 3 | 4;
  /** Step 1 re-ask (character). */
  tl?: string;
  /** Step 2 coach hint. */
  hint_eg?: string;
  /** Step 3 choice option item ids. */
  option_ids?: string[];
  /** Step 3 choice line (from the item's choice question). */
  choice_tl?: string;
};

export type SelectConvoCandidatesResult = {
  kind: ConvoSelectKind;
  candidates: ConvoSelectCandidate[];
  help?: ConvoSelectHelp;
};
