import OpenAI from "openai";
import { SYSTEM_PROMPT_BASE_PREMISES, SYSTEM_PROMPT_UNIFIED_OVERLAP } from "./systemPrompt";
import {
  BASE_PREMISE_GENERATION_DEVELOPER_PROMPT,
  UNIFIED_OVERLAP_ENGINE_DEVELOPER_PROMPT,
} from "./developerPrompt";
import { StyleContract, STYLE_CONTRACTS } from "./style-contracts";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not set in environment variables. Please check your .env.local file.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BASE_MODEL = process.env.OPENAI_MODEL ?? "gpt-4-turbo-preview";
const UNIFIED_MODEL = process.env.UNIFIED_MODEL || process.env.REWRITE_MODEL || process.env.OPENAI_MODEL || "gpt-4o";

const JSON_OUTPUT_REMINDER = `CRITICAL: You must return valid JSON only. Do not include any text outside the JSON structure.`;

export interface ComedyGenerationConfig {
  baseTemperature?: number;
  rewriteTemperature?: number;
  premiseCount?: number;
  enableRewrite?: boolean;
}

function getDefaultConfig(): Required<ComedyGenerationConfig> {
  return {
    baseTemperature: 0.7,
    rewriteTemperature: 0.8,
    premiseCount: 15,
    enableRewrite: true,
  };
}

function getDefaultStyleContract(): StyleContract {
  return STYLE_CONTRACTS[0];
}

export type WorldPremiseItem = { world: string; premise: string };
export type Overlap = { id: string; label: string; statement: string };
export type Rewrite = { id: string; alts: [string, string, string] };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export interface JokeGenResponse {
  jokes?: string[];
  error?: string;
}

export interface GenerateComedyResponse extends JokeGenResponse {
  baseJokes?: string[];
  selectedPremises?: WorldPremiseItem[];
  overlaps?: Overlap[];
  rewrites?: Rewrite[];
}

export interface GenerateOverlapReportResponse {
  report: string;
  overlaps?: Overlap[];
  rewrites?: Rewrite[];
}

function getOpenAIClient(): OpenAI {
  return client;
}

function normalizePremise(premise: string): string {
  return premise.trim().replace(/\"/g, '\\\"').replace(/\n/g, " ");
}

function buildUserMessage(topic: string, premiseCount: number) {
  return `Topic:\n${topic}\n\nGenerate ${premiseCount} collision notes.\n\nEach note must:\n- Be EXACTLY one sentence\n- Express one collision or angle\n- Include at least one concrete object or action\n\nReturn them as JSON with the key "items".`;
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
  const userMessage = buildUserMessage(topic, premiseCount);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT_BASE_PREMISES },
    { role: "developer", content: BASE_PREMISE_GENERATION_DEVELOPER_PROMPT },
    { role: "user", content: userMessage },
  ];

  if (addReminder) {
    messages.push({ role: "developer", content: JSON_OUTPUT_REMINDER });
  }

  const completion = await openai.chat.completions.create({
    model: BASE_MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature,
    max_tokens: 2000,
  });

  const outputText = completion.choices[0]?.message?.content || "";
  if (!outputText.trim()) throw new Error("Empty response from OpenAI.");

  const parsed = JSON.parse(outputText.trim());
  if (!Array.isArray(parsed.items)) {
    throw new Error('Response must include an "items" array.');
  }

  return parsed.items.map((item: unknown) => {
    const row = asRecord(item);
    const worldValue = row.world;
    const premiseValue = row.premise;
    return {
      world: typeof worldValue === "string" && worldValue.trim() ? worldValue.trim() : "unspecified",
      premise: typeof premiseValue === "string" ? premiseValue.trim() : String(premiseValue ?? "").trim(),
    };
  });
}

function buildUnifiedUserMessage(topic: string, styleContract: StyleContract, rewriteCount: number): string {
  return `PREMISE:\n${topic}\n\nVOICE CONTRACT (apply only to rewrites):\n${JSON.stringify(styleContract, null, 2)}\n\nrewriteCount K: ${rewriteCount}\n\nReturn JSON only in this exact shape:\n{\n  "overlaps": [\n    { "id": "A1", "label": "plain language label", "statement": "single sentence overlap statement" }\n  ],\n  "rewrites": [\n    { "id": "A1", "alts": ["alt 1", "alt 2", "alt 3"] }\n  ]\n}\n\nRules:\n- overlaps must contain 10 to 15 items\n- rewrites must contain exactly K items\n- rewrites ids must exist in overlaps\n- each rewrites.alts must contain exactly 3 items\n- no punchlines, no templates, no random absurd substitution\n- phase B may reexpress overlaps but must not invent new overlaps\n- use certain language and avoid hedge words\n- keep conjunction use low and sentences purposeful.`;
}

function parseUnifiedPayload(parsed: unknown): { overlaps: Overlap[]; rewrites: Rewrite[] } {
  const root = asRecord(parsed);
  if (!Array.isArray(root.overlaps) || !Array.isArray(root.rewrites)) {
    throw new Error('Unified response must include "overlaps" and "rewrites" arrays.');
  }

  const overlaps: Overlap[] = root.overlaps.map((item: unknown, index: number) => {
    const row = asRecord(item);
    const idValue = row.id;
    const labelValue = row.label;
    const statementValue = row.statement;
    return {
      id: typeof idValue === "string" && idValue.trim() ? idValue.trim() : `A${index + 1}`,
      label: typeof labelValue === "string" ? labelValue.trim() : "",
      statement: typeof statementValue === "string" ? statementValue.trim() : "",
    };
  });

  const rewrites: Rewrite[] = root.rewrites.map((item: unknown) => {
    const row = asRecord(item);
    const altsRaw = Array.isArray(row.alts) ? row.alts : [];
    const fixedAlts = [
      String(altsRaw[0] ?? "").trim(),
      String(altsRaw[1] ?? "").trim(),
      String(altsRaw[2] ?? "").trim(),
    ] as [string, string, string];

    return {
      id: typeof row.id === "string" ? row.id.trim() : "",
      alts: fixedAlts,
    };
  });

  return { overlaps, rewrites };
}

async function generateUnifiedOverlapsAndRewrites({
  topic,
  rewriteCount,
  styleContract,
  temperature,
}: {
  topic: string;
  rewriteCount: number;
  styleContract: StyleContract;
  temperature: number;
}): Promise<{ overlaps: Overlap[]; rewrites: Rewrite[] }> {
  const openai = getOpenAIClient();

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT_UNIFIED_OVERLAP },
    { role: "developer", content: UNIFIED_OVERLAP_ENGINE_DEVELOPER_PROMPT },
    { role: "user", content: buildUnifiedUserMessage(topic, styleContract, rewriteCount) },
  ];

  const completion = await openai.chat.completions.create({
    model: UNIFIED_MODEL,
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "unified_overlap_generation",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["overlaps", "rewrites"],
          properties: {
            overlaps: {
              type: "array",
              minItems: 10,
              maxItems: 15,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "label", "statement"],
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  statement: { type: "string" },
                },
              },
            },
            rewrites: {
              type: "array",
              minItems: rewriteCount,
              maxItems: rewriteCount,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "alts"],
                properties: {
                  id: { type: "string" },
                  alts: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    temperature,
    top_p: 1,
    max_tokens: 3200,
  });

  const outputText = completion.choices[0]?.message?.content || "";
  if (!outputText.trim()) throw new Error("Empty response from OpenAI (Unified). ");

  const parsed = JSON.parse(outputText.trim());
  return parseUnifiedPayload(parsed);
}

function buildReportFromUnified(topic: string, overlaps: Overlap[], rewrites: Rewrite[]): string {
  const overlapMap = new Map(overlaps.map((item) => [item.id, item]));
  const blocks = rewrites
    .map((rewrite, index) => {
      const overlap = overlapMap.get(rewrite.id);
      const premiseLine = overlap?.statement ?? `Overlap for ${rewrite.id}`;
      return `OVERLAP #${index + 1}\n${premiseLine}\n${rewrite.alts.join("\n")}`;
    })
    .join("\n\n");

  return `John Branyan's Overlap Comedy Engine — Unified Report\n\nPremise Clarified:\n${normalizePremise(topic)}\n\nRewrites:\n${blocks}`;
}

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

  if (!finalConfig.enableRewrite) {
    return { report: "" };
  }

  const { overlaps, rewrites } = await generateUnifiedOverlapsAndRewrites({
    topic,
    rewriteCount: finalConfig.premiseCount,
    styleContract: contractToUse,
    temperature: finalConfig.rewriteTemperature,
  });

  return {
    report: buildReportFromUnified(topic, overlaps, rewrites),
    overlaps,
    rewrites,
  };
}
