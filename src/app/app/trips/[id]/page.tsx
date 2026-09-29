"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tr } from "@/lib/i18n";
import { money, shortDate, longDate, todayISO } from "@/lib/format";
import { Sheet } from "@/components/Sheet";
import { TripFormSheet } from "@/components/TripFormSheet";
import {
  ITEM_KINDS,
  autoCover,
  countdown,
  coverUrl,
  initials,
  kindIcon,
  settleUp,
  tripBalances,
  tripWhen,
  type Trip,
  type TripContribution,
  type TripExpense,
  type TripItem,
  type TripItemKind,
  type TripMember,
} from "@/lib/trips";

type Tab = "plan" | "money" | "notes";

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [items, setItems] = useState<TripItem[]>([]);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [contribs, setContribs] = useState<TripContribution[]>([]);
  const [me, setMe] = useState<string>("");
  const [tab, setTab] = useState<Tab>("plan");
  const [editTrip, setEditTrip] = useState(false);
  const [itemSheet, setItemSheet] = useState<TripItem | "new" | null>(null);
  const [expSheet, setExpSheet] = useState<TripExpense | "new" | null>(null);
  const [fundSheet, setFundSheet] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: u }, t, m, it, ex, co] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("trips").select("*").eq("id", id).maybeSingle(),
      supabase.from("trip_members").select("*").eq("trip_id", id),
      supabase.from("trip_items").select("*").eq("trip_id", id),
      supabase.from("trip_expenses").select("*").eq("trip_id", id).order("spent_on", { ascending: false }),
      supabase.from("trip_contributions").select("*").eq("trip_id", id).order("given_on", { ascending: false }),
    ]);
    setMe(u.user?.id ?? "");
    setTrip((t.data as Trip) ?? null);
    setMembers((m.data ?? []) as TripMember[]);
    setItems((it.data ?? []) as TripItem[]);
    setExpenses((ex.data ?? []) as TripExpense[]);
    setContribs((co.data ?? []) as TripContribution[]);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const nameOf = useCallback(
    (uid: string) => (uid === me ? tr("You") : members.find((x) => x.user_id === uid)?.display_name ?? tr("Someone")),
    [members, me]
  );

  if (trip === undefined) return <p className="faint py-16 text-center text-sm">{tr("Loading…")}</p>;
  if (trip === null)
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <p className="font-display text-lg font-semibold">{tr("Trip not found")}</p>
        <Link href="/app/trips" className="mt-3 inline-block text-sm font-semibold" style={{ color: "var(--mint)" }}>
          {tr("← All trips")}
        </Link>
      </div>
    );

  const img = coverUrl(trip.cover_path);
  const cd = countdown(trip);
  const spent = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const plannedCost = items.reduce((a, i) => a + Number(i.cost ?? 0), 0);
  const isOwner = trip.owner_id === me;

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      {/* ---- cover ---- */}
      <div className="card relative overflow-hidden !p-0">
        <div className="relative h-56 bg-cover bg-center sm:h-64" style={{ backgroundImage: img ? `url("${img}")` : autoCover(trip.destination || trip.name) }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.6) 100%)" }} />
          {!img && (
            <span className="absolute bottom-16 right-5 max-w-[60%] truncate font-display text-5xl font-bold uppercase tracking-tight text-white/20 sm:text-7xl">
              {(trip.destination || trip.name).split(/[·,]/)[0].trim()}
            </span>
          )}
          <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
            <Link href="/app/trips" className="rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              {tr("← Trips")}
            </Link>
            <div className="flex gap-2">
              <button className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#1b2433]" onClick={() => setInviteOpen(true)}>
                {tr("Invite")}
              </button>
              <button className="rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-white backdrop-blur" onClick={() => setEditTrip(true)}>
                {tr("Edit")}
              </button>
            </div>
          </div>
          <div className="absolute bottom-4 left-5 right-5 text-white">
            <span className="mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: cd.tone === "now" ? "var(--mint)" : "rgba(255,255,255,.9)", color: cd.tone === "now" ? "#fff" : "#1b2433" }}>
              {cd.label}
            </span>
            <h1 className="font-display text-3xl font-semibold leading-tight drop-shadow">{trip.name}</h1>
            <p className="text-sm opacity-90">
              {trip.destination ? `${trip.destination} · ` : ""}
              {tripWhen(trip)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <span key={m.user_id} className="chip flex items-center gap-1.5 !py-0.5 text-xs">
                <span className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold" style={{ background: "var(--surface-2)" }}>
                  {initials(m.display_name)}
                </span>
                {m.user_id === me ? tr("You") : m.display_name}
              </span>
            ))}
          </div>
          <div className="ml-auto flex gap-4 text-xs tabnum">
            <span className="muted">
              {tr("Spent")} <b style={{ color: "var(--text)" }}>{money(spent)}</b>
              {trip.budget ? <span className="faint"> / {money(Number(trip.budget))}</span> : null}
            </span>
          </div>
        </div>
      </div>

      {/* ---- tabs ---- */}
      <div className="card grid grid-cols-3 gap-1 p-1">
        {(
          [
            ["plan", tr("Itinerary")],
            ["money", tr("Money & splits")],
            ["notes", tr("Notes")],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="rounded-xl py-2 text-sm font-semibold"
            style={tab === k ? { background: "var(--text)", color: "var(--surface)" } : { color: "var(--text-soft)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "plan" && <Itinerary trip={trip} items={items} plannedCost={plannedCost} onAdd={() => setItemSheet("new")} onOpen={(i) => setItemSheet(i)} />}
      {tab === "money" && (
        <MoneyTab
          trip={trip}
          members={members}
          expenses={expenses}
          contribs={contribs}
          plannedCost={plannedCost}
          nameOf={nameOf}
          onAddExpense={() => setExpSheet("new")}
          onOpenExpense={(e) => setExpSheet(e)}
          onAddFund={() => setFundSheet(true)}
          onDeleteContribution={async (cid) => {
            await createClient().from("trip_contributions").delete().eq("id", cid);
            load();
          }}
        />
      )}
      {tab === "notes" && <NotesTab trip={trip} onSaved={load} />}

      {editTrip && (
        <TripFormSheet
          trip={trip}
          onClose={() => setEditTrip(false)}
          onSaved={() => {
            setEditTrip(false);
            load();
          }}
          onDelete={
            isOwner
              ? async () => {
                  await createClient().from("trips").delete().eq("id", trip.id);
                  router.push("/app/trips");
                }
              : undefined
          }
          onLeave={
            !isOwner
              ? async () => {
                  await createClient().from("trip_members").delete().eq("trip_id", trip.id).eq("user_id", me);
                  router.push("/app/trips");
                }
              : undefined
          }
        />
      )}
      {itemSheet && (
        <ItemSheet
          tripId={trip.id}
          item={itemSheet === "new" ? null : itemSheet}
          defaultDate={trip.start_date ?? todayISO()}
          onClose={() => setItemSheet(null)}
          onSaved={() => {
            setItemSheet(null);
            load();
          }}
        />
      )}
      {expSheet && (
        <ExpenseSheet
          tripId={trip.id}
          expense={expSheet === "new" ? null : expSheet}
          members={members}
          me={me}
          nameOf={nameOf}
          onClose={() => setExpSheet(null)}
          onSaved={() => {
            setExpSheet(null);
            load();
          }}
        />
      )}
      {fundSheet && (
        <FundSheet
          tripId={trip.id}
          members={members}
          me={me}
          nameOf={nameOf}
          onClose={() => setFundSheet(false)}
          onSaved={() => {
            setFundSheet(false);
            load();
          }}
        />
      )}
      {inviteOpen && <InviteSheet trip={trip} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

/* ------------------------------ Itinerary ------------------------------ */

function Itinerary({ trip, items, plannedCost, onAdd, onOpen }: { trip: Trip; items: TripItem[]; plannedCost: number; onAdd: () => void; onOpen: (i: TripItem) => void }) {
  const byDay = new Map<string, TripItem[]>();
  for (const i of items) {
    const k = i.item_date ?? "";
    byDay.set(k, [...(byDay.get(k) ?? []), i]);
  }
  const days = [...byDay.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a < b ? -1 : 1));
  const dayN = (iso: string) => {
    if (!trip.start_date || !iso) return null;
    const [y, m, d] = trip.start_date.split("-").map(Number);
    const [y2, m2, d2] = iso.split("-").map(Number);
    const n = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y, m - 1, d)) / 86400000) + 1;
    return n >= 1 ? n : null;
  };
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between px-1">
        <p className="muted text-sm">
          {items.length === 0 ? tr("Nothing planned yet.") : tr("{n} things planned", { n: items.length })}
          {plannedCost > 0 && <> · {tr("booked {amt}", { amt: money(plannedCost) })}</>}
        </p>
        <button className="btn btn-primary !py-1.5 !text-sm" onClick={onAdd}>
          {tr("+ Add")}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-10 text-center">
          <div className="flex gap-2 text-2xl">✈️ 🏨 🎟️</div>
          <p className="muted max-w-xs text-sm">{tr("Add flights, hotels and plans with their confirmation numbers — everyone on the trip sees them.")}</p>
        </div>
      ) : (
        <div className="relative grid gap-4 pl-5">
          <span className="absolute bottom-2 left-[7px] top-2 w-px" style={{ background: "var(--border)" }} />
          {days.map((d) => (
            <div key={d || "undated"} className="relative grid gap-2">
              <span className="absolute -left-5 top-1 h-3.5 w-3.5 rounded-full border-2" style={{ background: "var(--surface)", borderColor: "var(--mint)" }} />
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--mint)" }}>
                {d ? (
                  <>
                    {dayN(d) ? `${tr("Day {n}", { n: dayN(d)! })} · ` : ""}
                    {longDate(d)}
                  </>
                ) : (
                  tr("No date")
                )}
              </p>
              {byDay
                .get(d)!
                .sort((a, b) => (a.item_time ?? "99") < (b.item_time ?? "99") ? -1 : 1)
                .map((i) => (
                  <button key={i.id} onClick={() => onOpen(i)} className="card flex items-start gap-3 p-3.5 text-left transition hover:-translate-y-0.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: "var(--surface-2)" }}>
                      {kindIcon(i.kind)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        {i.item_time && <span className="tabnum text-xs font-semibold" style={{ color: "var(--mint)" }}>{i.item_time}</span>}
                        <span className="truncate font-semibold">{i.title}</span>
                      </span>
                      <span className="muted block text-xs">
                        {[i.reference, i.location, i.end_date && i.end_date !== i.item_date ? tr("until {d}", { d: shortDate(i.end_date) }) : null].filter(Boolean).join(" · ")}
                      </span>
                      {i.confirmation && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px]" style={{ background: "var(--surface-2)" }}>
                          {tr("Conf.")} {i.confirmation}
                        </span>
                      )}
                      {i.details && <span className="faint mt-1 block text-xs">{i.details}</span>}
                    </span>
                    {i.cost ? <span className="tabnum text-sm font-semibold">{money(Number(i.cost))}</span> : null}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemSheet({ tripId, item, defaultDate, onClose, onSaved }: { tripId: string; item: TripItem | null; defaultDate: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<TripItemKind>(item?.kind ?? "flight");
  const [f, setF] = useState({
    title: item?.title ?? "",
    item_date: item?.item_date ?? defaultDate,
    item_time: item?.item_time ?? "",
    end_date: item?.end_date ?? "",
    location: item?.location ?? "",
    reference: item?.reference ?? "",
    confirmation: item?.confirmation ?? "",
    url: item?.url ?? "",
    details: item?.details ?? "",
    cost: item?.cost ? String(item.cost) : "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const refLabel = kind === "flight" ? tr("Flight number") : kind === "transport" ? tr("Train / bus / car") : tr("Reference");
  const titlePh = kind === "flight" ? tr("e.g. Phoenix → Rome") : kind === "stay" ? tr("e.g. Hotel in Trastevere") : tr("e.g. Vatican tour");

  async function save() {
    if (!f.title.trim()) {
      setErr(tr("Add a title"));
      return;
    }
    setBusy(true);
    const row = {
      trip_id: tripId,
      kind,
      title: f.title.trim(),
      item_date: f.item_date || null,
      item_time: f.item_time || null,
      end_date: f.end_date || null,
      location: f.location.trim() || null,
      reference: f.reference.trim() || null,
      confirmation: f.confirmation.trim() || null,
      url: f.url.trim() || null,
      details: f.details.trim() || null,
      cost: f.cost ? Number(f.cost) : null,
    };
    const supabase = createClient();
    const { error } = item ? await supabase.from("trip_items").update(row).eq("id", item.id) : await supabase.from("trip_items").insert(row);
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved();
  }
  async function remove() {
    if (!item) return;
    await createClient().from("trip_items").delete().eq("id", item.id);
    onSaved();
  }

  return (
    <Sheet open onClose={onClose} title={item ? tr("Edit plan") : tr("Add to the trip")}>
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-1.5">
          {ITEM_KINDS.map((k) => (
            <button
              key={k.k}
              onClick={() => setKind(k.k)}
              className="rounded-xl border px-2 py-2 text-xs font-semibold"
              style={kind === k.k ? { borderColor: "var(--mint)", background: "var(--mint-soft)" } : { borderColor: "var(--border)" }}
            >
              <span className="mr-1">{k.icon}</span>
              {tr(k.label)}
            </button>
          ))}
        </div>
        <input className="input" placeholder={titlePh} value={f.title} onChange={set("title")} autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="faint text-xs font-semibold">{kind === "stay" ? tr("Check-in") : tr("Date")}</span>
            <input className="input" type="date" value={f.item_date} onChange={set("item_date")} />
          </label>
          {kind === "stay" ? (
            <label className="grid gap-1">
              <span className="faint text-xs font-semibold">{tr("Check-out")}</span>
              <input className="input" type="date" value={f.end_date} onChange={set("end_date")} />
            </label>
          ) : (
            <label className="grid gap-1">
              <span className="faint text-xs font-semibold">{tr("Time")}</span>
              <input className="input" type="time" value={f.item_time} onChange={set("item_time")} />
            </label>
          )}
        </div>
        {kind !== "note" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="faint text-xs font-semibold">{refLabel}</span>
                <input className="input" placeholder={kind === "flight" ? "AM 402" : ""} value={f.reference} onChange={set("reference")} />
              </label>
              <label className="grid gap-1">
                <span className="faint text-xs font-semibold">{tr("Confirmation #")}</span>
                <input className="input font-mono" value={f.confirmation} onChange={set("confirmation")} />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="faint text-xs font-semibold">{tr("Place / address")}</span>
              <input className="input" value={f.location} onChange={set("location")} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">
                <span className="faint text-xs font-semibold">{tr("Cost")}</span>
                <input className="input" type="number" inputMode="decimal" min="0" placeholder="$" value={f.cost} onChange={set("cost")} />
              </label>
              <label className="grid gap-1">
                <span className="faint text-xs font-semibold">{tr("Link")}</span>
                <input className="input" type="url" placeholder="https://" value={f.url} onChange={set("url")} />
              </label>
            </div>
          </>
        )}
        <label className="grid gap-1">
          <span className="faint text-xs font-semibold">{tr("Notes")}</span>
          <textarea className="input min-h-[70px]" value={f.details} onChange={set("details")} />
        </label>
        {item?.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="text-xs font-semibold" style={{ color: "var(--mint)" }}>
            {tr("Open link ↗")}
          </a>
        )}
        {err && <p className="text-xs" style={{ color: "var(--over)" }}>{err}</p>}
        <div className="flex items-center gap-2 pt-1">
          {item && (
            <button className="text-xs font-semibold" style={{ color: "var(--over)" }} onClick={remove}>
              {tr("Delete")}
            </button>
          )}
          <span className="flex-1" />
          <button className="btn btn-ghost" onClick={onClose}>{tr("Cancel")}</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? tr("Saving…") : tr("Save")}</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------ Money ------------------------------ */

function MoneyTab({
  trip,
  members,
  expenses,
  contribs,
  plannedCost,
  nameOf,
  onAddExpense,
  onOpenExpense,
  onAddFund,
  onDeleteContribution,
}: {
  trip: Trip;
  members: TripMember[];
  expenses: TripExpense[];
  contribs: TripContribution[];
  plannedCost: number;
  nameOf: (u: string) => string;
  onAddExpense: () => void;
  onOpenExpense: (e: TripExpense) => void;
  onAddFund: () => void;
  onDeleteContribution: (id: string) => void;
}) {
  const spent = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const budget = Number(trip.budget ?? 0);
  const fundIn = contribs.reduce((a, c) => a + Number(c.amount), 0);
  const fundGoal = Number(trip.fund_goal ?? 0);
  const net = useMemo(() => tripBalances(members, expenses), [members, expenses]);
  const moves = useMemo(() => settleUp(net), [net]);
  const byMember = new Map<string, number>();
  for (const c of contribs) byMember.set(c.user_id, (byMember.get(c.user_id) ?? 0) + Number(c.amount));

  const Bar = ({ v, of, color }: { v: number; of: number; color: string }) => (
    <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
      <div className="h-full rounded-full" style={{ width: `${of > 0 ? Math.min(100, (v / of) * 100) : 0}%`, background: color }} />
    </div>
  );

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("Budget")}</p>
          <p className="font-display text-2xl font-semibold tabnum">
            {money(spent)} {budget > 0 && <span className="faint text-base font-medium">/ {money(budget)}</span>}
          </p>
          {budget > 0 ? <Bar v={spent} of={budget} color={spent > budget ? "var(--over)" : "var(--mint)"} /> : <p className="faint text-xs">{tr("Set a budget in Edit.")}</p>}
          <p className="faint mt-2 text-xs">
            {plannedCost > 0 && tr("Reservations add up to {amt}", { amt: money(plannedCost) })}
            {budget > 0 && ` · ${spent <= budget ? tr("{amt} left", { amt: money(budget - spent) }) : tr("{amt} over", { amt: money(spent - budget) })}`}
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("Trip fund")}</p>
            <button className="text-xs font-semibold" style={{ color: "var(--mint)" }} onClick={onAddFund}>
              {tr("+ Put money in")}
            </button>
          </div>
          <p className="font-display text-2xl font-semibold tabnum">
            {money(fundIn)} {fundGoal > 0 && <span className="faint text-base font-medium">/ {money(fundGoal)}</span>}
          </p>
          {fundGoal > 0 && <Bar v={fundIn} of={fundGoal} color="#5aa9e6" />}
          <div className="mt-2 grid gap-1">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between text-xs">
                <span className="muted">{nameOf(m.user_id)}</span>
                <span className="tabnum">{money(byMember.get(m.user_id) ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <p className="font-display text-sm font-semibold">{tr("Who owes who")}</p>
        {moves.length === 0 ? (
          <p className="faint mt-1 text-xs">{expenses.length ? tr("Everyone is even.") : tr("Add expenses and we split them for you.")}</p>
        ) : (
          <ul className="mt-2 grid gap-1.5">
            {moves.map((mv, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <b>{nameOf(mv.from)}</b>
                <span className="faint">{tr("pays")}</span>
                <b>{nameOf(mv.to)}</b>
                <span className="ml-auto tabnum font-semibold" style={{ color: "var(--over)" }}>
                  {money(mv.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-display text-sm font-semibold">{tr("Expenses")}</p>
          <button className="btn btn-primary !py-1 !text-xs" onClick={onAddExpense}>
            {tr("+ Expense")}
          </button>
        </div>
        {expenses.length === 0 ? (
          <p className="faint border-t px-4 py-4 text-xs" style={{ borderColor: "var(--border)" }}>
            {tr("Nothing yet. Add what each person pays — dinner, tickets, the Airbnb.")}
          </p>
        ) : (
          <div className="divide-y border-t" style={{ borderColor: "var(--border)" }}>
            {expenses.map((e) => (
              <button key={e.id} onClick={() => onOpenExpense(e)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:opacity-80">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.title}</span>
                  <span className="faint block text-xs">
                    {tr("{who} paid", { who: nameOf(e.paid_by) })} · {shortDate(e.spent_on)}
                    {e.split_among && e.split_among.length > 0 && e.split_among.length < members.length
                      ? ` · ${tr("split with {list}", { list: e.split_among.map(nameOf).join(", ") })}`
                      : ` · ${tr("split between everyone")}`}
                  </span>
                </span>
                <span className="tabnum font-semibold">{money(Number(e.amount))}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {contribs.length > 0 && (
        <div className="card overflow-hidden">
          <p className="px-4 py-3 font-display text-sm font-semibold">{tr("Money put in the fund")}</p>
          <div className="divide-y border-t" style={{ borderColor: "var(--border)" }}>
            {contribs.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {nameOf(c.user_id)} <span className="faint text-xs">· {shortDate(c.given_on)}{c.note ? ` · ${c.note}` : ""}</span>
                </span>
                <span className="tabnum font-semibold" style={{ color: "var(--mint)" }}>+{money(Number(c.amount))}</span>
                <button className="faint text-xs" onClick={() => onDeleteContribution(c.id)} aria-label={tr("Delete")}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExpenseSheet({ tripId, expense, members, me, nameOf, onClose, onSaved }: { tripId: string; expense: TripExpense | null; members: TripMember[]; me: string; nameOf: (u: string) => string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? me);
  const [date, setDate] = useState(expense?.spent_on ?? todayISO());
  const all = members.map((m) => m.user_id);
  const [among, setAmong] = useState<string[]>(expense?.split_among?.length ? expense.split_among : all);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (u: string) => setAmong(among.includes(u) ? among.filter((x) => x !== u) : [...among, u]);
  const each = among.length ? Number(amount || 0) / among.length : 0;

  async function save() {
    if (!title.trim() || !(Number(amount) > 0)) {
      setErr(tr("Add what it was and how much"));
      return;
    }
    if (among.length === 0) {
      setErr(tr("Pick who shares it"));
      return;
    }
    setBusy(true);
    const row = { trip_id: tripId, title: title.trim(), amount: Number(amount), paid_by: paidBy, spent_on: date, split_among: among.length === all.length ? null : among };
    const supabase = createClient();
    const { error } = expense ? await supabase.from("trip_expenses").update(row).eq("id", expense.id) : await supabase.from("trip_expenses").insert(row);
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved();
  }
  async function remove() {
    if (!expense) return;
    await createClient().from("trip_expenses").delete().eq("id", expense.id);
    onSaved();
  }

  return (
    <Sheet open onClose={onClose} title={expense ? tr("Edit expense") : tr("New expense")}>
      <div className="grid gap-3">
        <input className="input" placeholder={tr("e.g. Dinner in Florence")} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="faint text-xs font-semibold">{tr("Amount")}</span>
            <input className="input" type="number" inputMode="decimal" min="0" placeholder="$" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="faint text-xs font-semibold">{tr("Date")}</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="faint text-xs font-semibold">{tr("Who paid")}</span>
          <select className="input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {nameOf(m.user_id)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-1.5">
          <span className="faint text-xs font-semibold">{tr("Split between")}</span>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const on = among.includes(m.user_id);
              return (
                <button
                  key={m.user_id}
                  onClick={() => toggle(m.user_id)}
                  className="rounded-full border px-3 py-1 text-xs font-semibold"
                  style={on ? { borderColor: "var(--mint)", background: "var(--mint-soft)", color: "var(--mint)" } : { borderColor: "var(--border)", color: "var(--text-soft)" }}
                >
                  {on ? "✓ " : ""}
                  {nameOf(m.user_id)}
                </button>
              );
            })}
          </div>
          {each > 0 && <span className="faint text-[11px]">{tr("{amt} each", { amt: money(each) })}</span>}
        </div>
        {err && <p className="text-xs" style={{ color: "var(--over)" }}>{err}</p>}
        <div className="flex items-center gap-2 pt-1">
          {expense && (
            <button className="text-xs font-semibold" style={{ color: "var(--over)" }} onClick={remove}>
              {tr("Delete")}
            </button>
          )}
          <span className="flex-1" />
          <button className="btn btn-ghost" onClick={onClose}>{tr("Cancel")}</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? tr("Saving…") : tr("Save")}</button>
        </div>
      </div>
    </Sheet>
  );
}

function FundSheet({ tripId, members, me, nameOf, onClose, onSaved }: { tripId: string; members: TripMember[]; me: string; nameOf: (u: string) => string; onClose: () => void; onSaved: () => void }) {
  const [who, setWho] = useState(me);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    if (!(Number(amount) > 0)) {
      setErr(tr("How much?"));
      return;
    }
    const { error } = await createClient().from("trip_contributions").insert({ trip_id: tripId, user_id: who, amount: Number(amount), given_on: date, note: note.trim() || null });
    if (error) setErr(error.message);
    else onSaved();
  }
  return (
    <Sheet open onClose={onClose} title={tr("Put money in the fund")}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="faint text-xs font-semibold">{tr("Amount")}</span>
            <input className="input" type="number" inputMode="decimal" min="0" placeholder="$" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
          <label className="grid gap-1">
            <span className="faint text-xs font-semibold">{tr("Date")}</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="faint text-xs font-semibold">{tr("Who")}</span>
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {nameOf(m.user_id)}
              </option>
            ))}
          </select>
        </label>
        <input className="input" placeholder={tr("Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
        {err && <p className="text-xs" style={{ color: "var(--over)" }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>{tr("Cancel")}</button>
          <button className="btn btn-primary" onClick={save}>{tr("Save")}</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------ Notes & invite ------------------------------ */

function NotesTab({ trip, onSaved }: { trip: Trip; onSaved: () => void }) {
  const [v, setV] = useState(trip.notes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  async function save() {
    if (v === (trip.notes ?? "")) return;
    setState("saving");
    await createClient().from("trips").update({ notes: v || null }).eq("id", trip.id);
    setState("saved");
    onSaved();
  }
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-display text-sm font-semibold">{tr("Shared notes")}</p>
        <span className="faint text-xs">{state === "saving" ? tr("Saving…") : state === "saved" ? tr("Saved") : tr("Everyone on the trip can edit")}</span>
      </div>
      <textarea
        className="input min-h-[260px] leading-relaxed"
        placeholder={tr("Packing list, places to try, visa info, ideas…")}
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setState("idle");
        }}
        onBlur={save}
      />
    </div>
  );
}

function InviteSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/app/trips/join?code=${trip.invite_code}` : "";
  return (
    <Sheet open onClose={onClose} title={tr("Invite to {name}", { name: trip.name })}>
      <div className="grid gap-3">
        <p className="muted text-sm">{tr("Send this link to your partner or friends. They create a free Montfort Money account and join the trip.")}</p>
        <div className="rounded-xl p-3 font-mono text-xs break-all" style={{ background: "var(--surface-2)" }}>
          {link}
        </div>
        <div className="flex items-center gap-2">
          <span className="faint text-xs">
            {tr("Code")}: <b className="font-mono tracking-widest" style={{ color: "var(--text)" }}>{trip.invite_code}</b>
          </span>
          <span className="flex-1" />
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                if (navigator.share) await navigator.share({ title: trip.name, url: link });
                else {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }
              } catch {
                /* cancelled */
              }
            }}
          >
            {copied ? tr("Copied ✓") : tr("Share link")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
