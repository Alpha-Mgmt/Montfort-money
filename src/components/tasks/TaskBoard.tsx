"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { tr, useApp } from "@/lib/i18n";
import { money } from "@/lib/format";

/**
 * Tasks like a spreadsheet: a week from Monday to Sunday, one column per day.
 * Type on the empty line to add, click a line to edit it, drag it (or use ⋯)
 * to move it to another day. Day and month views use the same lines.
 */

type T = {
  id: string;
  title: string;
  due_date: string | null;
  status: "pending" | "completed";
  amount: number | null;
  created_at: string;
  position: number | null;
  duration_min: number | null;
};
/** order inside a day: explicit position, else when it was created */
const keyOf = (t: T) => (t.position ?? Date.parse(t.created_at) / 1000);
export type BoardView = "week" | "day" | "month";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const monday = (s: string) => {
  const d = parse(s);
  const wd = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - wd);
  return iso(d);
};
const todayStr = () => iso(new Date());
/** "08:30" -> 510 */
const toMin = (hhmm: string | null | undefined) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};
const toHHMM = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
/** clock time for the day: 24h in Spanish, short 12h in English */
const fmtT = (min: number, loc: string) => {
  const h = Math.floor(min / 60) % 24;
  const m = pad(min % 60);
  if (loc.startsWith("es")) return `${h}:${m}`;
  return `${h % 12 || 12}:${m}${h < 12 ? "a" : "p"}`;
};
/** 45 -> "45m", 90 -> "1h 30m" */
const fmtD = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};
const DUR_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
/** the line being dragged right now (set synchronously, before React re-renders) */
const DRAG: { id: string | null } = { id: null };
/** a textarea that grows with its text, so long lines wrap instead of hiding */
const grow = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};

type Api = {
  loc: string;
  anchor: string;
  byDay: Map<string, T[]>;
  dragId: string | null;
  overDay: string | null;
  menu: string | null;
  setMenu: React.Dispatch<React.SetStateAction<string | null>>;
  setDragId: React.Dispatch<React.SetStateAction<string | null>>;
  setOverDay: React.Dispatch<React.SetStateAction<string | null>>;
  add: (title: string, date: string | null) => void;
  rename: (t: T, title: string) => void;
  move: (id: string, date: string | null, position?: number) => void;
  place: (id: string, day: string | null, targetId: string, where: "before" | "after") => void;
  nudge: (t: T, day: string | null, dir: -1 | 1) => void;
  rowOver: { id: string; where: "before" | "after" } | null;
  setRowOver: React.Dispatch<React.SetStateAction<{ id: string; where: "before" | "after" } | null>>;
  remove: (id: string) => void;
  toggle: (t: T) => void;
  onDetails: (id: string) => void;
  dropProps: (day: string | null) => Record<string, any>;
  startOf: (day: string) => number | null;
  setStart: (day: string, hhmm: string | null) => void;
  setDuration: (id: string, min: number | null) => void;
  moveAll: (from: string, to: string | null) => void;
};
const Ctx = createContext<Api>(null as unknown as Api);


export function TaskBoard({ view, onDetails }: { view: BoardView; onDetails: (id: string) => void }) {
  const { lang } = useApp();
  const loc = lang === "es" ? "es-MX" : "en-US";
  const [tasks, setTasks] = useState<T[]>([]);
  const [anchor, setAnchor] = useState(todayStr());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [rowOver, setRowOver] = useState<{ id: string; where: "before" | "after" } | null>(null);
  const [starts, setStarts] = useState<Record<string, string>>({});

  async function load() {
    const sb = createClient();
    const [{ data }, { data: prof }] = await Promise.all([
      sb.from("tasks").select("id,title,due_date,status,amount,created_at,position,duration_min").order("created_at", { ascending: true }),
      sb.from("profiles").select("task_day_starts").maybeSingle(),
    ]);
    setTasks(((data ?? []) as any[]).map((t) => ({ ...t, amount: t.amount == null ? null : Number(t.amount) })));
    if (prof && (prof as any).task_day_starts) setStarts((prof as any).task_day_starts);
  }
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("mf:changed", on);
    return () => window.removeEventListener("mf:changed", on);
  }, []);

  // close any open menu on a click outside it, or with Escape
  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => (e.target as HTMLElement).closest?.(".tb-menu, .tb-more, .tb-trig") || setMenu(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);

  const byDay = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const t of tasks) {
      const k = t.due_date ?? "none";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    for (const l of m.values()) l.sort((a, b) => keyOf(a) - keyOf(b));
    return m;
  }, [tasks]);

  /* ---------- writes (optimistic) ---------- */
  const db = () => createClient();
  async function add(title: string, date: string | null) {
    const tmp: T = { id: `tmp-${Date.now()}`, title, due_date: date, status: "pending", amount: null, created_at: new Date().toISOString(), position: Date.now() / 1000, duration_min: null };
    setTasks((x) => [...x, tmp]);
    const {
      data: { user },
    } = await db().auth.getUser();
    const { data } = await db()
      .from("tasks")
      .insert({ user_id: user!.id, title, kind: "expense", amount: null, category_id: null, account_id: null, due_date: date, recurrence: "none", position: tmp.position })
      .select("id,created_at")
      .single();
    if (data) setTasks((x) => x.map((t) => (t.id === tmp.id ? { ...t, id: (data as any).id, created_at: (data as any).created_at } : t)));
    else load();
  }
  async function rename(t: T, title: string) {
    if (title === t.title) return;
    setTasks((x) => x.map((y) => (y.id === t.id ? { ...y, title } : y)));
    await db().from("tasks").update({ title }).eq("id", t.id);
  }
  async function move(id: string, date: string | null, position?: number) {
    const patch: Partial<T> = position === undefined ? { due_date: date } : { due_date: date, position };
    setTasks((x) => x.map((y) => (y.id === id ? { ...y, ...patch } : y)));
    setMenu(null);
    await db().from("tasks").update(patch).eq("id", id);
  }
  /** put a task right before / after another one (any day) */
  function place(id: string, day: string | null, targetId: string, where: "before" | "after") {
    const list = (byDay.get(day ?? "none") ?? []).filter((t) => t.id !== id);
    const i = list.findIndex((t) => t.id === targetId);
    if (i < 0) return move(id, day);
    const k = keyOf(list[i]);
    const nb = where === "before" ? list[i - 1] : list[i + 1];
    const pos = nb ? (k + keyOf(nb)) / 2 : where === "before" ? k - 1 : k + 1;
    move(id, day, pos);
  }
  /** one step up (-1) or down (+1) inside its day */
  function nudge(t: T, day: string | null, dir: -1 | 1) {
    const list = byDay.get(day ?? "none") ?? [];
    const i = list.findIndex((x) => x.id === t.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    place(t.id, day, list[j].id, dir < 0 ? "before" : "after");
  }
  /** move every pending line of a day to another day, keeping their order */
  async function moveAll(from: string, to: string | null) {
    setMenu(null);
    const list = (byDay.get(from) ?? []).filter((t) => t.status === "pending");
    if (!list.length || to === from) return;
    const target = (byDay.get(to ?? "none") ?? []).filter((t) => !list.includes(t));
    const base = target.length ? Math.max(...target.map(keyOf)) : Date.now() / 1000;
    const pos = new Map(list.map((t, i) => [t.id, base + i + 1]));
    setTasks((x) => x.map((y) => (pos.has(y.id) ? { ...y, due_date: to, position: pos.get(y.id)! } : y)));
    await Promise.all(list.map((t) => db().from("tasks").update({ due_date: to, position: pos.get(t.id) }).eq("id", t.id)));
  }
  async function setDuration(id: string, min: number | null) {
    const v = min == null || min <= 0 ? null : Math.min(1440, Math.round(min / 5) * 5);
    setTasks((x) => x.map((y) => (y.id === id ? { ...y, duration_min: v } : y)));
    await db().from("tasks").update({ duration_min: v }).eq("id", id);
  }
  const startOf = (day: string) => toMin(starts[day] ?? starts.default);
  /** start time of a day; the last one you set becomes the default for other days */
  async function setStart(day: string, hhmm: string | null) {
    const next = { ...starts };
    if (hhmm) {
      next[day] = hhmm;
      next.default = hhmm;
    } else delete next[day];
    setStarts(next);
    const {
      data: { user },
    } = await db().auth.getUser();
    if (user) await db().from("profiles").update({ task_day_starts: next }).eq("id", user.id);
  }
  async function remove(id: string) {
    setTasks((x) => x.filter((y) => y.id !== id));
    await db().from("tasks").delete().eq("id", id);
  }
  async function toggle(t: T) {
    const done = t.status === "completed";
    setTasks((x) => x.map((y) => (y.id === t.id ? { ...y, status: done ? "pending" : "completed" } : y)));
    await db().rpc(done ? "uncomplete_task" : "complete_task", { p_task_id: t.id });
    window.dispatchEvent(new Event("mf:changed"));
  }

  /* ---------- pieces ---------- */
  const dropProps = (day: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!DRAG.id) return;
      e.preventDefault();
      setOverDay(day ?? "none");
    },
    onDragLeave: () => setOverDay((o) => (o === (day ?? "none") ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain") || DRAG.id;
      DRAG.id = null;
      setOverDay(null);
      setDragId(null);
      if (id) move(id, day);
    },
  });

  const api: Api = { loc, anchor, byDay, dragId, overDay, menu, setMenu, setDragId, setOverDay, add, rename, move, remove, toggle, onDetails, dropProps, place, nudge, rowOver, setRowOver, startOf, setStart, setDuration, moveAll };
  /* ---------- views ---------- */
  const weekStart = monday(anchor);
  const step = view === "week" ? 7 : view === "day" ? 1 : 0;
  const nav = (dir: number) => {
    if (view === "month") {
      const d = parse(anchor);
      setAnchor(iso(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    } else setAnchor(addDays(anchor, dir * step));
  };
  const title =
    view === "week"
      ? (() => {
          const a = parse(weekStart);
          const b = parse(addDays(weekStart, 6));
          const f = (x: Date) => x.toLocaleDateString(loc, { day: "numeric", month: "short" });
          return `${f(a)} – ${f(b)}`;
        })()
      : view === "day"
        ? parse(anchor).toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long" })
        : parse(anchor).toLocaleDateString(loc, { month: "long", year: "numeric" });

  const noDate = (byDay.get("none") ?? []).filter((t) => t.status === "pending");

  return (
    <Ctx.Provider value={api}>
    <div className="grid gap-3" onClick={(e) => (e.target as HTMLElement).closest(".tb-menu, .tb-more, .tb-trig") || setMenu(null)}>
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost !px-3" onClick={() => nav(-1)} aria-label={tr("Previous")}>
          ‹
        </button>
        <button className="btn btn-ghost !px-3 text-sm" onClick={() => setAnchor(todayStr())}>
          {tr("Today")}
        </button>
        <button className="btn btn-ghost !px-3" onClick={() => nav(1)} aria-label={tr("Next")}>
          ›
        </button>
        <h2 className="ml-1 font-display text-lg font-semibold">{title.charAt(0).toUpperCase() + title.slice(1)}</h2>
      </div>

      {view === "week" && (
        <div className="tb-week">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
            <DayColumn key={d} day={d} />
          ))}
        </div>
      )}

      {view === "day" && (
        <div className="mx-auto w-full max-w-2xl">
          <DayColumn day={anchor} big />
        </div>
      )}

      {view === "month" && (
        <MonthGrid
          anchor={anchor}
          loc={loc}
          byDay={byDay}
          overDay={overDay}
          dropProps={dropProps}
          setDragId={setDragId}
          openDay={(d) => {
            setAnchor(d);
            window.dispatchEvent(new CustomEvent("mf:tasks-view", { detail: "day" }));
          }}
        />
      )}

      {view !== "month" && (
        <div className={`tb-col tb-nodate ${overDay === "none" ? "tb-over" : ""}`} {...dropProps(null)}>
          <div className="tb-head">
            <span>{tr("No date")}</span>
            <span className="faint ml-auto text-[11px]">{tr("drag here or to a day")}</span>
          </div>
          <div className="tb-lines">
            {noDate.map((t) => (
              <Row key={t.id} t={t} day={null} />
            ))}
            <NewLine day={null} />
          </div>
        </div>
      )}
    </div>
    </Ctx.Provider>
  );
}

function MonthGrid({
  anchor,
  loc,
  byDay,
  overDay,
  dropProps,
  setDragId,
  openDay,
}: {
  anchor: string;
  loc: string;
  byDay: Map<string, T[]>;
  overDay: string | null;
  dropProps: (d: string | null) => Record<string, any>;
  setDragId: (id: string | null) => void;
  openDay: (d: string) => void;
}) {
  const a = parse(anchor);
  const first = iso(new Date(a.getFullYear(), a.getMonth(), 1));
  const start = monday(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = todayStr();
  return (
    <div className="tb-month">
      {days.slice(0, 7).map((d) => (
        <div key={`h${d}`} className="faint pb-1 text-center text-[11px] font-semibold capitalize">
          {parse(d).toLocaleDateString(loc, { weekday: "short" }).replace(".", "")}
        </div>
      ))}
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        const inMonth = parse(d).getMonth() === a.getMonth();
        return (
          <div
            key={d}
            className={`tb-cell ${inMonth ? "" : "opacity-40"} ${overDay === d ? "tb-over" : ""} ${d === today ? "tb-today" : ""}`}
            onClick={() => openDay(d)}
            {...dropProps(d)}
          >
            <span className={`tb-num ${d === today ? "tb-num-on" : ""}`}>{parse(d).getDate()}</span>
            {list.slice(0, 3).map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", t.id);
                  DRAG.id = t.id;
                  setDragId(t.id);
                }}
                onDragEnd={() => setDragId(null)}
                onClick={(e) => e.stopPropagation()}
                className={`tb-chip ${t.status === "completed" ? "line-through opacity-50" : ""}`}
              >
                {t.title}
              </div>
            ))}
            {list.length > 3 && <span className="faint text-[10px]">+{list.length - 3}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Row({ t, day, when }: { t: T; day: string | null; when?: { s: number; e: number } }) {
  const { loc, anchor, dragId, menu, setMenu, setDragId, setOverDay, rename, move, remove, toggle, onDetails, place, nudge, rowOver, setRowOver, setDuration } = useContext(Ctx);
  const durKey = `dur:${t.id}`;
  const [v, setV] = useState(t.title);
  useEffect(() => setV(t.title), [t.title]);
  const done = t.status === "completed";
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday(day ?? anchor), i));
  return (
    <div
      className={`tb-row group ${done ? "tb-done" : ""} ${dragId === t.id ? "opacity-40" : ""} ${rowOver?.id === t.id ? `tb-ins-${rowOver.where}` : ""}`}
      onDragOver={(e) => {
        if (!DRAG.id || DRAG.id === t.id) return;
        e.preventDefault();
        e.stopPropagation();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const where = e.clientY < r.top + r.height / 2 ? "before" : "after";
        if (rowOver?.id !== t.id || rowOver.where !== where) setRowOver({ id: t.id, where });
        setOverDay(day ?? "none");
      }}
      onDragLeave={() => setRowOver((o) => (o?.id === t.id ? null : o))}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData("text/plain") || DRAG.id;
        DRAG.id = null;
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const where = e.clientY < r.top + r.height / 2 ? "before" : "after";
        setRowOver(null);
        setOverDay(null);
        setDragId(null);
        if (id && id !== t.id) place(id, day, t.id, where);
      }}
      draggable={!t.id.startsWith("tmp-")}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
        DRAG.id = t.id;
        setDragId(t.id);
      }}
      onDragEnd={() => {
        DRAG.id = null;
        setDragId(null);
        setOverDay(null);
        setRowOver(null);
      }}
    >
      <button className={`tb-check ${done ? "tb-check-on" : ""}`} onClick={() => toggle(t)} aria-label={done ? tr("Undo") : tr("Done")}>
        {done ? "✓" : ""}
      </button>
      <div className="min-w-0 flex-1">
      <textarea
        ref={grow}
        rows={1}
        className="tb-input tb-area"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          grow(e.target);
        }}
        onBlur={() => (v.trim() ? rename(t, v.trim()) : remove(t.id))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
            setTimeout(() => document.querySelector<HTMLInputElement>(`[data-new="${day ?? "none"}"]`)?.focus(), 30);
          }
          if (e.key === "Escape") {
            setV(t.title);
            (e.target as HTMLTextAreaElement).blur();
          }
          // Alt + ← / → moves the line one day
          if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            nudge(t, day, e.key === "ArrowUp" ? -1 : 1);
            setTimeout(() => (e.target as HTMLTextAreaElement).focus(), 60);
          }
          if (e.altKey && day && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            move(t.id, addDays(day, e.key === "ArrowLeft" ? -1 : 1));
          }
        }}
      />
        {(t.duration_min || t.amount != null) && (
          <div className="tb-meta">
            {when && (
              <span className="tb-time">
                {fmtT(when.s, loc)}–{fmtT(when.e, loc)}
              </span>
            )}
            {t.duration_min ? (
              <button className="tb-dur tb-trig" onClick={() => setMenu(menu === durKey ? null : durKey)}>
                {fmtD(t.duration_min)}
              </button>
            ) : null}
            {t.amount != null && <span>{money(t.amount)}</span>}
          </div>
        )}
      </div>
      {!t.duration_min && (
        <button className="tb-more tb-trig" onClick={() => setMenu(menu === durKey ? null : durKey)} aria-label={tr("How long?")} title={tr("How long?")}>
          ⏱
        </button>
      )}
      {menu === durKey && (
        <div className="tb-menu">
          <div className="faint px-2 pb-1 text-[10px] font-bold uppercase tracking-wide">{tr("How long?")}</div>
          <div className="mb-1 flex items-center gap-1 px-1">
            <button className="tb-mbtn w-10" onClick={() => setDuration(t.id, (t.duration_min ?? 0) - 5)}>
              −5
            </button>
            <span className="flex-1 text-center text-sm font-semibold tabular-nums">{t.duration_min ? fmtD(t.duration_min) : "—"}</span>
            <button className="tb-mbtn w-10" onClick={() => setDuration(t.id, (t.duration_min ?? 0) + 5)}>
              +5
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 px-1">
            {DUR_PRESETS.map((m) => (
              <button key={m} className={`tb-mbtn ${t.duration_min === m ? "tb-mbtn-on" : ""}`} onClick={() => (setDuration(t.id, m), setMenu(null))}>
                {fmtD(m)}
              </button>
            ))}
          </div>
          {t.duration_min ? (
            <button className="tb-mitem mt-1 w-full" style={{ color: "var(--over)" }} onClick={() => (setDuration(t.id, null), setMenu(null))}>
              {tr("Remove time")}
            </button>
          ) : null}
        </div>
      )}
      <button className="tb-more" onClick={() => setMenu(menu === t.id ? null : t.id)} aria-label={tr("Move")}>
        ⋯
      </button>
      {menu === t.id && (
        <div className="tb-menu" onMouseLeave={() => setMenu(null)}>
          <div className="mb-1 grid grid-cols-2 gap-1 px-1">
            <button className="tb-mbtn" onClick={() => (setMenu(null), nudge(t, day, -1))}>
              ↑ {tr("Up")}
            </button>
            <button className="tb-mbtn" onClick={() => (setMenu(null), nudge(t, day, 1))}>
              ↓ {tr("Down")}
            </button>
          </div>
          <div className="faint px-2 pb-1 text-[10px] font-bold uppercase tracking-wide">{tr("Move to")}</div>
          <div className="grid grid-cols-4 gap-1 px-1">
            {weekDays.map((d) => (
              <button key={d} className={`tb-mbtn ${d === day ? "tb-mbtn-on" : ""}`} onClick={() => move(t.id, d)}>
                {parse(d).toLocaleDateString(loc, { weekday: "short" }).replace(".", "")}
              </button>
            ))}
            <button className="tb-mbtn" onClick={() => move(t.id, addDays(day ?? todayStr(), 7))}>
              +7d
            </button>
          </div>
          <div className="mt-1 grid gap-0.5 border-t pt-1" style={{ borderColor: "var(--border)" }}>
            <button className="tb-mitem" onClick={() => move(t.id, null)}>
              {tr("No date")}
            </button>
            <button className="tb-mitem" onClick={() => setMenu(durKey)}>
              ⏱ {tr("How long?")}
            </button>
            <button
              className="tb-mitem"
              onClick={() => {
                setMenu(null);
                onDetails(t.id);
              }}
            >
              {tr("Details…")}
            </button>
            <button className="tb-mitem" style={{ color: "var(--over)" }} onClick={() => remove(t.id)}>
              {tr("Delete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewLine({ day }: { day: string | null }) {
  const { add } = useContext(Ctx);
  const [v, setV] = useState("");
  return (
    <input
      data-new={day ?? "none"}
      className="tb-input tb-new"
      placeholder={tr("+ Add")}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim()) {
          add(v.trim(), day);
          setV("");
        }
        if (e.key === "Escape") {
          setV("");
          (e.target as HTMLInputElement).blur();
        }
      }}
      onBlur={() => {
        if (v.trim()) {
          add(v.trim(), day);
          setV("");
        }
      }}
    />
  );
}

function DayColumn({ day, big }: { day: string; big?: boolean }) {
  const { loc, byDay, overDay, dropProps, startOf, setStart, moveAll, menu, setMenu } = useContext(Ctx);
  const list = byDay.get(day) ?? [];
  const today = todayStr();
  const isToday = day === today;
  const d = parse(day);
  const open = list.filter((t) => t.status === "pending").length;
  // the day's schedule: start time + each line's duration, in order
  const start = startOf(day);
  const when = new Map<string, { s: number; e: number }>();
  let total = 0;
  for (const t of list) {
    if (!t.duration_min) continue;
    if (start != null) when.set(t.id, { s: start + total, e: start + total + t.duration_min });
    total += t.duration_min;
  }
  const startKey = `start:${day}`;
  const dayKey = `day:${day}`;
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday(day), i));
  return (
    <div className={`tb-col ${overDay === day ? "tb-over" : ""} ${isToday ? "tb-today" : ""}`} {...dropProps(day)}>
      <div className="tb-head">
        <span className="capitalize">{d.toLocaleDateString(loc, { weekday: big ? "long" : "short" }).replace(".", "")}</span>
        <span className={`tb-num ${isToday ? "tb-num-on" : ""}`}>{d.getDate()}</span>
        {big && <span className="faint text-xs capitalize">{d.toLocaleDateString(loc, { month: "long", year: "numeric" })}</span>}
        <button className={`tb-start tb-trig ${start == null || total === 0 ? "tb-start-empty" : ""}`} onClick={() => setMenu(menu === startKey ? null : startKey)} title={tr("Day starts at")}>
          {start != null && total > 0 ? fmtT(start, loc) : "⏰"}
        </button>
        {open > 0 && (
          <button className="tb-count tb-trig ml-auto" onClick={() => setMenu(menu === dayKey ? null : dayKey)} title={tr("Move pending to")}>
            {open} ⋯
          </button>
        )}
        {menu === startKey && (
          <div className="tb-menu tb-menu-left">
            <div className="faint px-2 pb-1 text-[10px] font-bold uppercase tracking-wide">{tr("Day starts at")}</div>
            <div className="px-1">
              <input
                type="time"
                step={300}
                className="tb-timein"
                defaultValue={toHHMM(start ?? 480)}
                onChange={(e) => e.target.value && setStart(day, e.target.value)}
              />
            </div>
            <div className="mt-1 grid grid-cols-4 gap-1 px-1">
              {[6, 7, 8, 9].map((h) => (
                <button key={h} className={`tb-mbtn ${start === h * 60 ? "tb-mbtn-on" : ""}`} onClick={() => (setStart(day, toHHMM(h * 60)), setMenu(null))}>
                  {fmtT(h * 60, loc)}
                </button>
              ))}
            </div>
          </div>
        )}
        {menu === dayKey && (
          <div className="tb-menu">
            <div className="faint px-2 pb-1 text-[10px] font-bold uppercase tracking-wide">
              {tr("Move pending to")} ({open})
            </div>
            <div className="grid grid-cols-4 gap-1 px-1">
              {weekDays.map((w) => (
                <button key={w} disabled={w === day} className={`tb-mbtn ${w === day ? "opacity-30" : ""}`} onClick={() => moveAll(day, w)}>
                  {parse(w).toLocaleDateString(loc, { weekday: "short" }).replace(".", "")}
                </button>
              ))}
              <button className="tb-mbtn" onClick={() => moveAll(day, addDays(day, 7))}>
                +7d
              </button>
            </div>
            <div className="mt-1 grid gap-0.5 border-t pt-1" style={{ borderColor: "var(--border)" }}>
              {day < today && (
                <button className="tb-mitem" onClick={() => moveAll(day, today)}>
                  {tr("Today")}
                </button>
              )}
              <button className="tb-mitem" onClick={() => moveAll(day, addDays(day < today ? today : day, 1))}>
                {tr("Next day")}
              </button>
              <button className="tb-mitem" onClick={() => moveAll(day, null)}>
                {tr("No date")}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="tb-lines">
        {list.map((t) => (
          <Row key={t.id} t={t} day={day} when={when.get(t.id)} />
        ))}
        <NewLine day={day} />
      </div>
      {total > 0 && (
        <div className="tb-total">
          {fmtD(total)}
          {start != null && ` → ${fmtT(start + total, loc)}`}
        </div>
      )}
    </div>
  );
}
