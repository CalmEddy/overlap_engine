export type StyleContract = {
  styleId: string;
  reference: string;
  voiceDescription: string;
  diction: string;
  rhythm: string;
  energy: string;
  languageConstraints: string[];
  structuralBehavior: string;
};

export const STYLE_CONTRACTS: StyleContract[] = [
  {
    styleId: "warm_physical_storyteller",
    reference: "Conversational stage storyteller",
    voiceDescription: "Warm, human, present-tense narrator with visual specifics.",
    diction: "Everyday spoken language, vivid nouns and verbs.",
    rhythm: "Medium-length lines with occasional punchy short lines.",
    energy: "Confident and inviting.",
    languageConstraints: ["No hedging", "No academic jargon", "No punchline templates"],
    structuralBehavior: "Build each overlap like a playable scene with immediate visual cues."
  },
  {
    styleId: "obsessive_precision_ranter",
    reference: "High-control logic rant",
    voiceDescription: "Fast, specific, relentless categorizer.",
    diction: "Precise nouns, decisive verbs, no fluff.",
    rhythm: "Rapid sequence of decisive statements.",
    energy: "High urgency.",
    languageConstraints: ["No hedging", "No passive voice", "No vague abstractions"],
    structuralBehavior: "Escalation lines move from concrete to absurdly over-committed detail."
  },
  {
    styleId: "cold_minimalist_observer",
    reference: "Detached cinematic observer",
    voiceDescription: "Sparse, objective, sharp.",
    diction: "Lean and literal.",
    rhythm: "Short declarative lines.",
    energy: "Low heat, high precision.",
    languageConstraints: ["No hedging", "No decorative language", "No rhetorical questions"],
    structuralBehavior: "Prioritize observable behavior over interpretation."
  },
  {
    styleId: "hyper_logical_literalist",
    reference: "Formal absurd literalism",
    voiceDescription: "Rigidly logical framing with concrete outcomes.",
    diction: "Plain language with explicit causal links.",
    rhythm: "Methodical sentence progression.",
    energy: "Steady and emphatic.",
    languageConstraints: ["No hedging", "No figurative filler", "No unsupported claims"],
    structuralBehavior: "State premise mechanics like engineering steps."
  },
  {
    styleId: "cheerfully_misguided_optimist",
    reference: "Positive but concretely wrong guide",
    voiceDescription: "Bright confidence applied to absurdly concrete framing.",
    diction: "Friendly language and plain images.",
    rhythm: "Bouncy declarative statements.",
    energy: "High and upbeat.",
    languageConstraints: ["No hedging", "No cynicism", "No generic phrasing"],
    structuralBehavior: "Escalation should stay optimistic while details get more extreme."
  },
  {
    styleId: "dave_barry_adjacent",
    reference: "Mock-serious columnist",
    voiceDescription: "Mock-serious observer using bureaucratic layering and emphatic certainty.",
    diction: "Accessible vocabulary, institutional wording where useful.",
    rhythm: "Columns of medium sentences with occasional short parenthetical asides.",
    energy: "Playfully authoritative.",
    languageConstraints: ["No hedging", "Short parenthetical asides allowed", "No punchline templates"],
    structuralBehavior: "Treat ridiculous behavior as official procedure with confident certainty."
  }
];

export function getStyleContract(styleId: string): StyleContract {
  return STYLE_CONTRACTS.find((style) => style.styleId === styleId) ?? STYLE_CONTRACTS[0];
}
