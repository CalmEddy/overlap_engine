import OpenAI from "openai";
import { getStyleContract } from "@/lib/style-contracts";
import { phase1Schema, phase2Schema } from "@/lib/schemas";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export async function runTwoPhaseReport(premise: string, styleId: string): Promise<string> {
  const phase1System = `You are a mechanical overlap discovery engine. Return JSON only.
Produce only single-sentence overlaps. No jokes. No hedging language.`;

  const phase1Prompt = `Return strict JSON with keys premise, core, outer, compression.
Counts:
- core 10-15
- outer 12-25
- compression 5-10
Rules:
- each item is one sentence.
- a and b anchors must be concrete and non-empty.
User premise: ${premise}`;

  const phase1Response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    input: [
      { role: "system", content: phase1System },
      { role: "user", content: phase1Prompt }
    ],
    text: { format: { type: "json_object" } }
  });

  const phase1Raw = phase1Response.output_text;
  const phase1 = phase1Schema.parse(parseJson(phase1Raw));

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

  const phase2Response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    input: [
      { role: "system", content: phase2System },
      { role: "user", content: phase2Prompt }
    ],
    text: { format: { type: "json_object" } }
  });

  const phase2Raw = phase2Response.output_text;
  const phase2 = phase2Schema.parse(parseJson(phase2Raw));
  return phase2.report;
}
