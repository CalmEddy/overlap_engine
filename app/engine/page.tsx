import { requireUser } from "@/lib/auth";
import { getUserAccess } from "@/lib/subscription";
import { EngineClient } from "@/components/engine-client";

export default async function EnginePage() {
  const user = await requireUser();
  const access = await getUserAccess(user.id);

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-400">Credits remaining: {access.credits}</p>
      <EngineClient />
    </div>
  );
}
