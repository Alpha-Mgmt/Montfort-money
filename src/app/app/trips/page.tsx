"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tr } from "@/lib/i18n";
import { money, monthShort } from "@/lib/format";
import { toISO } from "@/lib/recurring";
import { TripFormSheet } from "@/components/TripFormSheet";
import {
  autoCover,
  countdown,
  tripWhen,
  coverUrl,
  daysUntil,
  initials,
  type Trip,
  type TripExpense,
  type TripMember,
} from "@/lib/trips";

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [spent, setSpent] = useState<Map<string, number>>(new Map());
  const [newOpen, setNewOpen] = useState(false);
  const [code, setCode] = useState("");

  async function load() {
    const supabase = createClient();
    const [{ data: t }, { data: m }, { data: e }] = await Promise.all([
      supabase.from("trips").select("*").eq("archived", false).order("start_date", { ascending: true, nullsFirst: false }),
      supabase.from("trip_members").select("*"),
      supabase.from("trip_expenses").select("trip_id,amount"),
    ]);
    setTrips((t ?? []) as Trip[]);
    setMembers((m ?? []) as TripMember[]);
    const s = new Map<string, number>();
    for (const x of (e ?? []) as Pick<TripExpense, "trip_id" | "amount">[]) s.set(x.trip_id, (s.get(x.trip_id) ?? 0) + Number(x.amount));
    setSpent(s);
  }
  useEffect(() => {
    load();
  }, []);

  const upcoming = useMemo(() => (trips ?? []).filter((t) => countdown(t).tone !== "past"), [trips]);
  const past = useMemo(() => (trips ?? []).filter((t) => countdown(t).tone === "past").reverse(), [trips]);

  return (
    <div className="mx-auto grid max-w-5xl gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{tr("Trips")}</h1>
          <p className="muted text-sm">{tr("Plan it together: the itinerary, reservations and who paid what.")}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
          {tr("+ New trip")}
        </button>
      </div>

      {trips === null ? (
        <p className="faint py-10 text-center text-sm">{tr("Loading…")}</p>
      ) : trips.length === 0 ? (
        <div className="card grid place-items-center gap-3 px-6 py-14 text-center">
          <div className="text-4xl">🧳</div>
          <p className="font-display text-lg font-semibold">{tr("Your first trip starts here")}</p>
          <p className="muted max-w-sm text-sm">{tr("Create a trip, invite your partner or friends with a link, and everyone adds flights, hotels and expenses.")}</p>
          <button className="btn btn-primary mt-1" onClick={() => setNewOpen(true)}>
            {tr("+ New trip")}
          </button>
        </div>
      ) : (
        <>
          <TripTimeline trips={trips} />
          {upcoming.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((t) => (
                <TripCard key={t.id} t={t} members={members.filter((m) => m.trip_id === t.id)} spent={spent.get(t.id) ?? 0} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <>
              <h2 className="faint mt-2 text-xs font-bold uppercase tracking-[0.12em]">{tr("Past trips")}</h2>
              <div className="grid gap-3 opacity-90 sm:grid-cols-2 lg:grid-cols-3">
                {past.map((t) => (
                  <TripCard key={t.id} t={t} members={members.filter((m) => m.trip_id === t.id)} spent={spent.get(t.id) ?? 0} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="card flex flex-wrap items-center gap-2 p-4 text-sm">
        <span className="muted">{tr("Got an invite code?")}</span>
        <input
          className="input !w-40 uppercase"
          placeholder="ABCD1234"
          value={code}
          maxLength={12}
          onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
        />
        <button className="btn btn-ghost" disabled={code.length < 6} onClick={() => router.push(`/app/trips/join?code=${code.toUpperCase()}`)}>
          {tr("Join")}
        </button>
      </div>

      {newOpen && <TripFormSheet onClose={() => setNewOpen(false)} onSaved={(id) => router.push(`/app/trips/${id}`)} />}
    </div>
  );
}

function TripCard({ t, members, spent }: { t: Trip; members: TripMember[]; spent: number }) {
  const cd = countdown(t);
  const img = coverUrl(t.cover_path);
  return (
    <Link href={`/app/trips/${t.id}`} className="card group overflow-hidden !p-0 transition hover:-translate-y-0.5">
      <div
        className="relative h-40 bg-cover bg-center"
        style={{ backgroundImage: img ? `url("${img}")` : autoCover(t.destination || t.name) }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,.55) 100%)" }} />
        <span
          className="absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          style={{ background: cd.tone === "now" ? "var(--mint)" : "rgba(255,255,255,.9)", color: cd.tone === "now" ? "#fff" : "#1b2433" }}
        >
          {cd.label}
        </span>
        <div className="absolute bottom-3 left-4 right-4 text-white">
          <p className="font-display text-xl font-semibold leading-tight drop-shadow">{t.name}</p>
          <p className="text-xs opacity-90">
            {t.destination ? `${t.destination} · ` : ""}
            {tripWhen(t)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex -space-x-2">
          {members.slice(0, 4).map((m) => (
            <span
              key={m.user_id}
              title={m.display_name}
              className="grid h-7 w-7 place-items-center rounded-full border-2 text-[10px] font-bold"
              style={{ background: "var(--surface-2)", borderColor: "var(--surface)" }}
            >
              {initials(m.display_name)}
            </span>
          ))}
          {members.length > 4 && <span className="faint pl-3 text-xs">+{members.length - 4}</span>}
        </div>
        <div className="ml-auto min-w-0 text-right">
          {t.budget ? (
            <>
              <p className="text-xs tabnum">
                <b>{money(spent)}</b> <span className="faint">/ {money(Number(t.budget))}</span>
              </p>
              <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (spent / Number(t.budget)) * 100)}%`, background: spent > Number(t.budget) ? "var(--over)" : "var(--mint)" }} />
              </div>
            </>
          ) : (
            <p className="faint text-xs">{spent > 0 ? tr("{amt} spent", { amt: money(spent) }) : tr("No budget yet")}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

/** trips on a time line: the next 12 months, each trip a bar on its dates */
function TripTimeline({ trips }: { trips: Trip[] }) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 12, 1);
  const span = end.getTime() - start.getTime();
  const dated = trips
    .filter((t) => t.start_date)
    .map((t) => {
      const [y, m, d] = t.start_date!.split("-").map(Number);
      const s = new Date(y, m - 1, d);
      const [y2, m2, d2] = (t.end_date || t.start_date!).split("-").map(Number);
      const e = new Date(y2, m2 - 1, d2 + 1);
      return { t, s, e };
    })
    .filter((x) => x.e > start && x.s < end);
  if (dated.length === 0) return null;
  const pct = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - start.getTime()) / span) * 100));
  const months = Array.from({ length: 12 }, (_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1));
  const todayPct = pct(now);
  return (
    <div className="card p-4">
      <p className="mb-3 font-display text-sm font-semibold">{tr("Next 12 months")}</p>
      <div className="relative">
        <div className="grid grid-cols-12 text-[10px]">
          {months.map((m, i) => (
            <span key={i} className="faint border-l pl-1" style={{ borderColor: "var(--border)" }}>
              {monthShort(toISO(m))}
            </span>
          ))}
        </div>
        <div className="relative mt-2 grid gap-1.5" style={{ containerType: "inline-size" }}>
          {dated.map(({ t, s, e }) => (
            <div key={t.id} className="relative h-6">
              <Link
                href={`/app/trips/${t.id}`}
                className={`absolute top-0 flex h-6 items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold ${pct(s) > 55 ? "flex-row-reverse" : ""}`}
                style={pct(s) > 55 ? { right: `${100 - pct(e)}%` } : { left: `${pct(s)}%` }}
                title={`${t.name} · ${tripWhen(t)}`}
              >
                <span className="h-4 rounded-full" style={{ width: `max(12px, ${((pct(e) - pct(s)) / 100) * 100}cqw)`, minWidth: 12, background: autoCover(t.destination || t.name) }} />
                <span>{t.name}</span>
                <span className="faint font-normal">{tripWhen(t)}</span>
              </Link>
            </div>
          ))}
          <span className="pointer-events-none absolute -top-2 bottom-0 w-px" style={{ left: `${todayPct}%`, background: "var(--text)" }} />
        </div>
      </div>
    </div>
  );
}

