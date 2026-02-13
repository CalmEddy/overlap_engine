import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-4xl font-bold">John Branyan&apos;s Overlap Comedy Engine</h1>
      <p className="text-slate-300">Turn one premise into a dense overlap analysis report.</p>
      <div className="flex gap-4">
        <Link className="rounded bg-blue-600 px-4 py-2" href="/engine">
          Go to Engine
        </Link>
        <Link className="rounded border border-slate-600 px-4 py-2" href="/billing">
          Billing
        </Link>
      </div>
    </div>
  );
}
