/** Known cells/words from Langify UserProgress (read-only). */
export type KnownProgress = {
  cells: {
    cellId: string;
    verb: string;
    tense: string;
    person: string;
    form: string;
    status: string;
  }[];
  words: string[];
  /** Finished Langify lesson-missions (for display / future unlock). */
  finishedMissions: {
    missionId: string;
    connectedWords: string[];
  }[];
};
