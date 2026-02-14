import OpenAI from "openai";
import { SYSTEM_PROMPT_BASE_PREMISES, SYSTEM_PROMPT_REWRITE } from "./systemPrompt";
import {
  BASE_PREMISE_GENERATION_DEVELOPER_PROMPT,
  OVERLAP_PHASE1_DEVELOPER_PROMPT_MINIMAL,
  REWRITE_DEVELOPER_PROMPT_SNAPSHOT_ESCALATION_FINAL,
  OVERLAP_PHASE2_REAUTHOR_AND_LAYOUT_PROMPT_MINIMAL,
} from "./developerPrompt";
import { StyleContract, STYLE_CONTRACTS, getStyleContract } from "./style-contracts";

// Validate API key before creating client
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in environment variables. Please check your .env.local file.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Model configuration
const BASE_MODEL = process.env.OPENAI_MODEL ?? "gpt-4-turbo-preview";
const REWRITE_MODEL = process.env.OPENAI_MODEL ?? "gpt-4-turbo-preview";

// JSON output reminder
const JSON_OUTPUT_REMINDER = `CRITICAL: You must return valid JSON only. Do not include any text outside the JSON structure.`;

// Configuration types
export interface ComedyGenerationConfig {
  baseTemperature?: number;
  rewriteTemperature?: number;
  premiseCount?: number;
}

function getDefaultConfig(): Required<ComedyGenerationConfig> {
  return {
    baseTemperature: 0.7,
    rewriteTemperature: 0.8,
    premiseCount: 15,
  };
}

function getDefaultStyleContract(): StyleContract {
  return STYLE_CONTRACTS[0];
}

function getOpenAIClient(): OpenAI {
  return client;
}

// Response types
export interface JokeGenResponse {
  jokes?: string[];
  error?: string;
}

export interface GenerateComedyResponse extends JokeGenResponse {
  baseJokes?: string[]; // Deprecated: use selectedPremises instead
  selectedPremises?: WorldPremiseItem[]; // The selected premises sent to rewrite (for debugging)
}

// Overlap Comedy Engine report response (two-phase, no DB writes)
export interface GenerateOverlapReportResponse {
  report: string;
  // Optional debug payload for dev tooling
  phase1?: OverlapPhase1Response;
}

export type OverlapPhase1Item = { world: string; premise: string };
export type OverlapPhase1Response = {
  items: OverlapPhase1Item[];
  outerField: OverlapPhase1Item[];
  compression: OverlapPhase1Item[];
};

// Base generation now returns premise notes.
export type WorldPremiseItem = { world: string; premise: string };

// Helper functions
function normalizePremise(premise: string): string {
  return premise.trim().replace(/"/g, '\\"').replace(/\n/g, " ");
}

function redactContent(content: string, maxLength: number = 50): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + "...";
}

function buildUserMessage(topic: string, premiseCount: number, cleanLabel: string) {
  return `Topic:\n${topic}\n\nGenerate ${premiseCount} collision notes.\n\nEach note must:\n- Be EXACTLY one sentence\n- Express one collision or angle\n- Include at least one concrete object or action\n\nReturn them as JSON with the key "items".`;
}

function buildOverlapPhase1UserMessage(topic: string) {
  return `PREMISE:\n${topic}\n\nGenerate overlap statements as JSON.\n\nBATCH REQUIREMENTS:\n- items: 12–18\n- outerField: 12–25 (one hop outward / topic-adjacent)\n- compression: 5–10\n\nRULES:\n- EXACTLY one sentence per item\n- Each sentence is MAXIMIZED (top-rung) escalation: the wrong rule set is fully true\n- Each sentence is CONCRETE (object/action/person/place or clearly pictured behavior)\n- Each sentence is CERTAIN: do NOT use hedging language (feels like, looks like, seems, might, probably, kind of, sort of, almost, basically, I imagine, I picture)\n- Do NOT write jokes, punchlines, or joke templates\n\nOUTPUT JSON SHAPE (STRICT):\n{\n  "items": [{"world":"unspecified","premise":"..."}],\n  "outerField": [{"world":"unspecified","premise":"..."}],\n  "compression": [{"world":"unspecified","premise":"..."}]\n}`;
}

function assertOverlapPhase1Shape(parsed: any): OverlapPhase1Response {
  const toItems = (arr: any, keyName: string): OverlapPhase1Item[] => {
    if (!Array.isArray(arr)) throw new Error(`Phase 1 JSON must include an array "${keyName}".`);
    return arr.map((x: any, i: number) => {
      const world = typeof x?.world === "string" && x.world.trim() ? x.world.trim() : "unspecified";
      const premise = typeof x?.premise === "string" ? x.premise.trim() : String(x?.premise ?? x ?? "").trim();
      if (!premise) throw new Error(`Phase 1 item ${keyName}[${i}] has empty premise.`);
      return { world, premise };
    });
  };

  const items = toItems(parsed?.items, "items");
  const outerField = toItems(parsed?.outerField, "outerField");
  const compression = toItems(parsed?.compression, "compression");

  // Lightweight count guards (chat-like behavior uses corrective retries; we mirror that here)
  if (items.length < 10) throw new Error(`Phase 1 "items" too short (${items.length}). Expected 12–18.`);
  if (outerField.length < 12) throw new Error(`Phase 1 "outerField" too short (${outerField.length}). Expected 12–25.`);
  if (compression.length < 5) throw new Error(`Phase 1 "compression" too short (${compression.length}). Expected 5–10.`);

  return { items, outerField, compression };
}

function assertReportShape(parsed: any): string {
  const report = typeof parsed?.report === "string" ? parsed.report : "";
  if (!report.trim()) throw new Error('Phase 2 must return a non-empty "report" string.');
  return report;
}

export async function generateBasePremises({
  topic,
  premiseCount,
  temperature,
  addReminder,
}: {
  topic: string;
  premiseCount: number;
  temperature: number;
  addReminder: boolean;
}): Promise<WorldPremiseItem[]> {
  const openai = getOpenAIClient();
  const cleanLabel = "premise";
  const userMessage = buildUserMessage(topic, premiseCount, cleanLabel);

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT_BASE_PREMISES },
    { role: "developer" as const, content: BASE_PREMISE_GENERATION_DEVELOPER_PROMPT },
    { role: "user" as const, content: userMessage },
  ];

  if (addReminder) {
    messages.push({ role: "developer", content: JSON_OUTPUT_REMINDER });
  }

  const completion = await openai.chat.completions.create({
    model: BASE_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature,
    top_p: 0.95,
    presence_penalty: 0.2,
    frequency_penalty: 0.2,
    max_tokens: 2000,
  });

  const outputText = completion.choices[0]?.message?.content || "";
  if (!outputText.trim()) throw new Error("Empty response from OpenAI.");

  let parsed: any;
  try {
    parsed = JSON.parse(outputText.trim());
  } catch {
    throw new Error("Invalid JSON response.");
  }

  if (!Array.isArray(parsed.items)) {
    throw new Error('Response must include an "items" array.');
  }

  return parsed.items.map((item: any) => ({
    world: typeof item?.world === "string" && item.world.trim() ? item.world.trim() : "unspecified",
    premise: typeof item?.premise === "string" ? item.premise.trim() : String(item?.premise ?? "").trim(),
  }));
}

/**
 * OVERLAP COMEDY ENGINE — Phase 1
 * Generate raw overlap statements (items + outerField + compression)
 */
async function generateOverlapPhase1({
  topic,
  temperature,
  addReminder,
}: {
  topic: string;
  temperature: number;
  addReminder: boolean;
}): Promise<OverlapPhase1Response> {
  const openai = getOpenAIClient();
  const userMessage = buildOverlapPhase1UserMessage(topic);

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT_BASE_PREMISES },
    { role: "developer" as const, content: OVERLAP_PHASE1_DEVELOPER_PROMPT_MINIMAL },
    { role: "user" as const, content: userMessage },
  ];

  if (addReminder) {
    messages.push({ role: "developer", content: JSON_OUTPUT_REMINDER });
  }

  const completion = await openai.chat.completions.create({
    model: BASE_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature,
    top_p: 0.95,
    presence_penalty: 0.2,
    frequency_penalty: 0.2,
    // Phase 1 returns 30–50 sentences; allow room.
    max_tokens: 2800,
  });

  const outputText = completion.choices[0]?.message?.content || "";
  if (!outputText.trim()) throw new Error("Empty response from OpenAI (Phase 1).");

  let parsed: any;
  try {
    parsed = JSON.parse(outputText.trim());
  } catch {
    throw new Error("Phase 1 returned invalid JSON.");
  }

  return assertOverlapPhase1Shape(parsed);
}

/**
 * OVERLAP COMEDY ENGINE — Phase 2
 * Re-author overlap statements using a StyleContract and arrange them into a report.
 */
async function generateOverlapPhase2Report({
  topic,
  phase1,
  styleContract,
  temperature,
  addReminder,
}: {
  topic: string;
  phase1: OverlapPhase1Response;
  styleContract: StyleContract;
  temperature: number;
  addReminder: boolean;
}): Promise<string> {
  const openai = getOpenAIClient();

  const styleContractJson = JSON.stringify(styleContract, null, 2);

  // Keep Phase 2 input compact and structured to reduce drift.
  const section = (title: string, items: OverlapPhase1Item[]) =>
    `${title}:\n` +
    items
      .map((it, i) => `${i + 1}. { "world": "${it.world}", "premise": "${normalizePremise(it.premise)}" }`)
      .join("\n");

  const userMessage = `Create a full Overlap Analysis Report.

TOPIC (for premise clarified + assumptions):
${topic}

STYLE CONTRACT:
${styleContractJson}

PHASE 1 RAW MATERIAL:
${section("CORE_OVERLAPS", phase1.items)}

${section("OUTER_FIELD", phase1.outerField)}

${section("COMPRESSION", phase1.compression)}

OUTPUT FORMAT (STRICT):
Return valid JSON only in this exact shape:
{ "report": "<plain text report with line breaks>" }`;

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT_REWRITE },
    { role: "developer" as const, content: OVERLAP_PHASE2_REAUTHOR_AND_LAYOUT_PROMPT_MINIMAL },
    { role: "user" as const, content: userMessage },
  ];

  if (addReminder) {
    messages.push({ role: "developer", content: JSON_OUTPUT_REMINDER });
  }

  const completion = await openai.chat.completions.create({
    model: REWRITE_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    max_tokens: 3600,
  });

  const outputText = completion.choices[0]?.message?.content || "";
  if (!outputText.trim()) throw new Error("Empty response from OpenAI (Phase 2).");

  let parsed: any;
  try {
    parsed = JSON.parse(outputText.trim());
  } catch {
    const redactedOutput = redactContent(outputText, 500);
    console.error(`[Overlap Phase 2] Invalid JSON. Response preview: ${redactedOutput}`);
    throw new Error("Phase 2 returned invalid JSON.");
  }

  return assertReportShape(parsed);
}

/**
 * Generate a full Overlap Analysis Report (two-call pipeline).
 *
 * This bypasses any database persistence and returns the report directly.
 */
export async function generateOverlapReport({
  topic,
  styleContract,
  config = {},
}: {
  topic: string;
  styleContract?: StyleContract;
  config?: ComedyGenerationConfig;
}): Promise<GenerateOverlapReportResponse> {
  const finalConfig = { ...getDefaultConfig(), ...config };
  const contractToUse = styleContract || getDefaultStyleContract();

  // Phase 1: raw overlap statements
  let phase1: OverlapPhase1Response;
  try {
    phase1 = await generateOverlapPhase1({
      topic,
      temperature: finalConfig.baseTemperature,
      addReminder: false,
    });
  } catch (error) {
    console.warn(`[Overlap Phase 1] Error, retrying: ${error instanceof Error ? error.message : "Unknown error"}`);
    phase1 = await generateOverlapPhase1({
      topic,
      temperature: finalConfig.baseTemperature,
      addReminder: true,
    });
  }

  // Phase 2: voice re-author + report layout
  let report: string;
  try {
    report = await generateOverlapPhase2Report({
      topic,
      phase1,
      styleContract: contractToUse,
      temperature: finalConfig.rewriteTemperature,
      addReminder: false,
    });
  } catch (error) {
    console.warn(`[Overlap Phase 2] Error, retrying: ${error instanceof Error ? error.message : "Unknown error"}`);
    report = await generateOverlapPhase2Report({
      topic,
      phase1,
      styleContract: contractToUse,
      temperature: finalConfig.rewriteTemperature,
      addReminder: true,
    });
  }

  return { report, phase1 };
}

