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
    // Show more context about JSON parsing errors
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const preview = raw.length > 200 ? raw.substring(0, 200) + "..." : raw;
    const errorPosition = errorMsg.match(/position (\d+)/);
    if (errorPosition) {
      const pos = parseInt(errorPosition[1]);
      const contextStart = Math.max(0, pos - 50);
      const contextEnd = Math.min(raw.length, pos + 50);
      const context = raw.substring(contextStart, contextEnd);
      throw new Error(`Failed to parse JSON at position ${pos}: ${errorMsg}\nContext: ...${context}...`);
    }
    throw new Error(`Failed to parse JSON: ${errorMsg}\nPreview: ${preview}`);
  }
}

export async function runTwoPhaseReport(premise: string, styleId: string): Promise<string> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4-turbo-preview";
  
  try {
  const phase1System = `You are a mechanical overlap discovery engine. Return JSON only.
Produce only single-sentence overlaps. No jokes. No hedging language.

CRITICAL: You MUST generate the FULL required number of items for each array. Do not stop early.
MANDATORY MINIMUM COUNTS:
- core: 10 items minimum (aim for 12-15)
- outer: 12 items minimum (aim for 15-20) 
- compression: 5 items minimum (aim for 7-10)

Before returning JSON, verify each array meets its minimum count. If any array is short, generate more items.`;

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

CRITICAL REQUIREMENTS - THESE ARE MANDATORY MINIMUMS:
1. core array: Generate EXACTLY 10-15 items (MINIMUM 10, do not stop at 10 - aim for 12-15)
2. outer array: Generate EXACTLY 12-25 items (MINIMUM 12, do not stop at 12 - aim for 15-20)
3. compression array: Generate EXACTLY 5-10 items (MINIMUM 5, do not stop at 5 - aim for 7-10)
4. All arrays must contain objects, NOT strings
5. All strings must be concrete and non-empty
6. Each overlap/line must be a complete sentence (8+ characters)

COUNT VERIFICATION BEFORE RETURNING:
- Count core items: must be 10-15
- Count outer items: must be 12-25  
- Count compression items: must be 5-10
- If any array has fewer than the minimum, generate more items until it meets the requirement

User premise: ${premise}

DO NOT return the JSON until all arrays meet their minimum counts. Generate the FULL required number of items.`;

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

  const phase2System = `You are writing a final Overlap Analysis Report. Return ONLY a JSON object with a single "report" key containing the complete formatted report as a plain text string (not structured JSON).

CRITICAL JSON REQUIREMENTS:
- The JSON must be valid and parseable
- All quotes inside the report string must be escaped as \\"
- Use \\n for newlines
- Avoid using straight quotes (") in the report text - use apostrophes (') or rephrase instead
- The JSON structure must be: {"report": "your text here"} with no other keys

Use this Style Contract Interpreter as binding rules:
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
4) Anchor check: both overlap anchors remain identifiable in each core block.

CRITICAL: Return format must be {"report": "full text here"} - do NOT include "sections" or any other keys.`;

  const phase2Prompt = `Transform this discovery JSON into a complete plain text report. Return ONLY a JSON object with a single "report" key containing the full formatted text as a string.

CRITICAL: The response must be EXACTLY this structure:
{
  "report": "John Branyan's Overlap Comedy Engine — Overlap Analysis Report\n\n[complete formatted report text here - must be at least 100 characters total]"
}

DO NOT include any other keys like "sections". Only "report" as a string.

The report string must contain:
1. Title (exactly): "John Branyan's Overlap Comedy Engine — Overlap Analysis Report"
2. Premise Clarified (one sentence)
3. Surface Assumptions (6-10 bullet points)
4. Core Overlaps (10-15 blocks, each with):
   OVERLAP #n
   Label
   Concrete Translation
   Escalation Burst (6-10 lines)
   Brain Storm with Objects, Activities, Idioms/Sayings, Double meanings
5. Outer Field Overlaps (12-25 one-sentence overlaps)
6. Compression Lines (5-10 one-sentence lines)

Format the entire report as a single continuous string with newlines (\\n) between sections.
The total report string must be at least 100 characters.

IMPORTANT: When including the report in JSON, ensure all quotes and special characters are properly escaped. Use \\n for newlines, \\" for quotes within the string.

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
      const parsed = parseJson(phase2Raw);
      phase2 = phase2Schema.parse(parsed);
    } catch (error) {
      // Provide more detailed error information
      if (error instanceof Error && error.message.includes("Failed to parse JSON")) {
        // JSON parsing error - show the problematic area
        throw new Error(`Phase 2 JSON parsing failed: ${error.message}`);
      }
      // Schema validation error
      const parsed = parseJson(phase2Raw);
      const reportLength = typeof parsed.report === "string" ? parsed.report.length : "not a string";
      const hasTitle = typeof parsed.report === "string" && parsed.report.includes("John Branyan's Overlap Comedy Engine — Overlap Analysis Report");
      throw new Error(`Phase 2 schema validation failed: ${error instanceof Error ? error.message : "Unknown error"}. Report length: ${reportLength}, Has title: ${hasTitle}. Response preview: ${phase2Raw.substring(0, 300)}...`);
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
