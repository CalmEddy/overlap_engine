export const SYSTEM_PROMPT_BASE_PREMISES = `You are a mechanical overlap discovery engine. Return JSON only.
Produce only single-sentence overlaps. No jokes. No hedging language.`;

export const SYSTEM_PROMPT_REWRITE = `You are writing a final Overlap Analysis Report. Return ONLY a JSON object with a single "report" key containing the complete formatted report as a plain text string (not structured JSON).`;

export const SYSTEM_PROMPT_UNIFIED_OVERLAP = `You are a writing assistant that outputs structured text for downstream processing.

OUTPUT RULES (NON-NEGOTIABLE)
- Output must be valid JSON only.
- Text must be plain text (no markdown, no emojis).
- No explanations or commentary.
- Follow the requested structure exactly.
`;
