import { describe, expect, it } from "vitest";
import { phase1Schema, phase2Schema } from "@/lib/schemas";

describe("schema guards", () => {
  it("accepts valid phase1 json", () => {
    const sample = {
      premise: "Parents now need an app to negotiate bedtime.",
      core: Array.from({ length: 10 }).map((_, i) => ({
        world: "family",
        a: `anchor-a-${i}`,
        b: `anchor-b-${i}`,
        overlap: "This is one concrete overlap sentence with enough length."
      })),
      outer: Array.from({ length: 12 }).map((_, i) => ({
        world: "remote",
        seed: `seed-${i}`,
        a: `anchor-a-${i}`,
        b: `anchor-b-${i}`,
        overlap: "This is one concrete outer overlap sentence with enough length."
      })),
      compression: Array.from({ length: 5 }).map((_, i) => ({
        world: "line",
        a: `anchor-a-${i}`,
        b: `anchor-b-${i}`,
        line: "This is one compression sentence with enough length."
      }))
    };

    expect(() => phase1Schema.parse(sample)).not.toThrow();
  });

  it("rejects missing report title in phase2", () => {
    expect(() => phase2Schema.parse({ report: "bad report" })).toThrow();
  });
});
