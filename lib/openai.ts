import OpenAI from "openai";
import { getStyleContract } from "@/lib/style-contracts";
import { phase1Schema, phase2Schema } from "@/lib/schemas";

// Validate API key before creating client
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in environment variables. Please check your .env.local file.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function runTwoPhaseReport(premise: string, styleId: string): Promise<string> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4-turbo-preview";
  
  try {
  const phase1System = `You are a mechanical overlap discovery engine. Return JSON only.
Produce only single-sentence overlaps. No jokes. No hedging language.
You MUST generate the FULL required number of items for each array. Do not stop early.
Minimum counts are MANDATORY: core (10+), outer (12+), compression (5+).`;

  const phase1Prompt = `Return strict JSON with this exact structure. These are MANDATORY minimum counts:

{
  "premise": "string (12+ characters, the user's premise)",
  "core": [
    {
      "world": "string (context/world name)",
      "a": "string (first anchor, concrete)",
      "b": "string (second anchor, concrete)",
      "overlap": "string (one sentence, 8+ characters)"
    }
    // MUST have EXACTLY 10-15 items (minimum 10, maximum 15)
  ],
  "outer": [
    {
      "world": "string (context/world name)",
      "seed": "string (seed concept)",
      "a": "string (first anchor, concrete)",
      "b": "string (second anchor, concrete)",
      "overlap": "string (one sentence, 8+ characters)"
    }
    // MUST have EXACTLY 12-25 items (minimum 12, maximum 25)
  ],
  "compression": [
    {
      "world": "string (context/world name)",
      "a": "string (first anchor, concrete)",
      "b": "string (second anchor, concrete)",
      "line": "string (one sentence, 8+ characters)"
    }
    // MUST have EXACTLY 5-10 items (minimum 5, maximum 10)
  ]
}

CRITICAL REQUIREMENTS:
1. core MUST be an array with AT LEAST 10 items (10-15 total)
2. outer MUST be an array with AT LEAST 12 items (12-25 total)
3. compression MUST be an array with AT LEAST 5 items (5-10 total)
4. All arrays must contain objects, NOT strings
5. All strings must be concrete and non-empty
6. Each overlap/line must be a complete sentence (8+ characters)

User premise: ${premise}

Generate the FULL required number of items for each array. Do not return fewer items.`;

    const phase1Response = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: phase1System },
        { role: "user", content: phase1Prompt }
      ],
      response_format: { type: "json_object" }
    });

    const phase1Raw = phase1Response.choices[0].message.content;
    if (!phase1Raw) {
      throw new Error("OpenAI API returned empty response for phase 1");
    }
    
    let phase1;
    try {
      const parsed = parseJson(phase1Raw);
      phase1 = phase1Schema.parse(parsed);
    } catch (error) {
      // Show the actual structure received to help debug
      const parsed = parseJson(phase1Raw);
      const structure = {
        premise: typeof parsed.premise,
        core: Array.isArray(parsed.core) ? `array[${parsed.core.length}]` : typeof parsed.core,
        outer: Array.isArray(parsed.outer) ? `array[${parsed.outer.length}]` : typeof parsed.outer,
        compression: Array.isArray(parsed.compression) ? `array[${parsed.compression.length}]` : typeof parsed.compression
      };
      throw new Error(`Phase 1 schema validation failed: ${error instanceof Error ? error.message : "Unknown error"}. Received structure: ${JSON.stringify(structure)}. Full response: ${phase1Raw.substring(0, 500)}...`);
    }

  const style = getStyleContract(styleId);

  const phase2System = `You are writing a final Overlap Analysis Report in plain text and JSON wrapping.
Use this Style Contract Interpreter as binding rules.
- styleId: ${style.styleId}
- reference: ${style.reference}
- voiceDescription: ${style.voiceDescription}
- diction: ${style.diction}
- rhythm: ${style.rhythm}
- energy: ${style.energy}
- languageConstraints: ${style.languageConstraints.join("; ")}
- structuralBehavior: ${style.structuralBehavior}
Global language rules: no joke templates, no punchlines, no hedging words.
Silent self-revision loop (do not print):
1) Scene check: Concrete Translation includes place/person/action/reaction.
2) Certainty check: remove hedge language and use declaratives.
3) Variety check: avoid repeated sentence stems in Escalation Burst.
4) Anchor check: both overlap anchors remain identifiable in each core block.`;

  const phase2Prompt = `Transform this discovery JSON into final plain text report inside JSON {"report":"..."}
Title must be exactly: John Branyan's Overlap Comedy Engine — Overlap Analysis Report
Sections in order:
1) Premise Clarified (one sentence)
2) Surface Assumptions (6-10 bullets)
3) Core Overlaps (10-15 blocks)
4) Outer Field Overlaps (12-25 one-sentence overlaps)
5) Compression Lines (5-10 one-sentence lines)
Core block format:
OVERLAP #n
Label
Concrete Translation
Escalation Burst (6-10 lines)
Brain Storm with Objects, Activities, Idioms/Sayings, Double meanings
Discovery JSON:
${JSON.stringify(phase1)}`;

    const phase2Response = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: phase2System },
        { role: "user", content: phase2Prompt }
      ],
      response_format: { type: "json_object" }
    });

    const phase2Raw = phase2Response.choices[0].message.content;
    if (!phase2Raw) {
      throw new Error("OpenAI API returned empty response for phase 2");
    }
    
    let phase2;
    try {
      phase2 = phase2Schema.parse(parseJson(phase2Raw));
    } catch (error) {
      throw new Error(`Phase 2 schema validation failed: ${error instanceof Error ? error.message : "Unknown error"}. Response: ${phase2Raw.substring(0, 200)}...`);
    }
    
    return phase2.report;
  } catch (error) {
    // Handle OpenAI API errors specifically
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        throw new Error("Invalid OpenAI API key. Please check your .env.local file.");
      }
      if (error.message.includes("model")) {
        throw new Error(`Invalid model name: ${model}. Try 'gpt-4-turbo-preview' or 'gpt-3.5-turbo'`);
      }
      if (error.message.includes("rate limit") || error.message.includes("quota")) {
        throw new Error("OpenAI API rate limit or quota exceeded. Please check your OpenAI account.");
      }
    }
    // Re-throw with more context
    throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
