"use client";

import { AIAssistant } from "@/components/AIAssistant";
import { monthStartISO } from "@/lib/format";
import { tr } from "@/lib/i18n";

/** Montfort AI as a full page: talk to it, it plans and moves things (you approve each change). */
export default function AIPage() {
  return (
    <div className="mx-auto grid max-w-3xl gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold">{tr("Montfort AI")}</h1>
        <p className="muted text-sm">{tr("Ask about your money, or tell it what to change — it shows you each change before doing it.")}</p>
      </div>
      <AIAssistant month={monthStartISO()} full />
    </div>
  );
}
