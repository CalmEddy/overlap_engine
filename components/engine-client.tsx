"use client";

import { useState } from "react";
import { STYLE_CONTRACTS } from "@/lib/style-contracts";

export function EngineClient() {
  const [premise, setPremise] = useState("");
  const [styleId, setStyleId] = useState(STYLE_CONTRACTS[0].styleId);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise, styleId })
    });

    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Generation failed");
      setLoading(false);
      return;
    }

    setReport(body.report);
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Overlap Engine</h1>
      <p className="text-slate-300">Stateless two-phase generation with server-side style contracts.</p>
      <textarea className="min-h-40 w-full" value={premise} onChange={(e) => setPremise(e.target.value)} placeholder="Enter your premise" />
      <select className="rounded border border-slate-700 bg-slate-900 px-3 py-2" value={styleId} onChange={(e) => setStyleId(e.target.value)}>
        {STYLE_CONTRACTS.map((style) => (
          <option key={style.styleId} value={style.styleId}>{style.styleId}</option>
        ))}
      </select>
      <div className="flex gap-3">
        <button className="rounded bg-blue-600 px-4 py-2" disabled={loading} onClick={generate}>{loading ? "Generating..." : "Generate report"}</button>
        <button className="rounded border border-slate-600 px-4 py-2" onClick={() => navigator.clipboard.writeText(report)} disabled={!report}>Copy</button>
      </div>
      {error && <p className="text-red-400">{error}</p>}
      <pre className="whitespace-pre-wrap rounded border border-slate-800 bg-slate-900 p-4 text-sm">{report || "Your report appears here."}</pre>
    </div>
  );
}
