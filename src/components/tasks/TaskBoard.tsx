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
};
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
  move: (id: string, date: string | null) => void;
  remove: (id: string) => void;
  toggle: (t: T) => void;
  onDetails: (id: string) => void;
  dropProps: (day: string | null) => Record<string, any>;
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

  async function load() {
    const { data } = await createClient()
      .from("tasks")
      .select("id,title,due_date,status,amount,created_at")
      .order("created_at", { ascending: true });
    setTasks(((data ?? []) as any[]).map((t) => ({ ...t, amount: t.amount == null ? null : Number(t.amount) })));
  }
  useEffect(() => {
    load();
    const on = () => load();
    window.addEventListener("mf:changed", on);
    return () => window.removeEventListener("mf:changed", on);
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const t of tasks) {
      const k = t.due_date ?? "none";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return m;
  }, [tasks]);

  /* ---------- writes (optimistic) ---------- */
  const db = () => createClient();
  async function add(title: string, date: string | null) {
    const tmp: T = { id: `tmp-${Date.now()}`, title, due_date: date, status: "pending", amount: null, created_at: new Date().toISOString() };
    setTasks((x) => [...x, tmp]);
    const {
      data: { user },
    } = await db().auth.getUser();
    const { data } = await db()
      .from("tasks")
      .insert({ user_id: user!.id, title, kind: "expense", amount: null, category_id: null, account_id: null, due_date: date, recurrence: "none" })
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
  async function move(id: string, date: string | null) {
    setTasks((x) => x.map((y) => (y.id === id ? { ...y, due_date: date } : y)));
    setMenu(null);
    await db().from("tasks").update({ due_date: date }).eq("id", id);
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
      if (!dragId) return;
      e.preventDefault();
      setOverDay(day ?? "none");
    },
    onDragLeave: () => setOverDay((o) => (o === (day ?? "none") ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain") || dragId;
      setOverDay(null);
      setDragId(null);
      if (id) move(id, day);
    },
  });

  const api: Api = { loc, anchor, byDay, dragId, overDay, menu, setMenu, setDragId, setOverDay, add, rename, move, remove, toggle, onDetails, dropProps };
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
    <div className="grid gap-3" onClick={(e) => (e.target as HTMLElement).closest(".tb-menu, .tb-more") || setMenu(null)}>
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

function Row({ t, day, compact }: { t: T; day: string | null; compact?: boolean }) {
  const { loc, anchor, dragId, menu, setMenu, setDragId, setOverDay, rename, move, remove, toggle, onDetails } = useContext(Ctx);
  const [v, setV] = useState(t.title);
  useEffect(() => setV(t.title), [t.title]);
  const done = t.status === "completed";
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday(day ?? anchor), i));
  return (
    <div
      className={`tb-row group ${done ? "tb-done" : ""} ${dragId === t.id ? "opacity-40" : ""}`}
      draggable={!t.id.startsWith("tmp-")}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
        setDragId(t.id);
      }}
      onDragEnd={() => {
        setDragId(null);
        setOverDay(null);
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
          if (e.altKey && day && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            move(t.id, addDays(day, e.key === "ArrowLeft" ? -1 : 1));
          }
        }}
      />
        {t.amount != null && <div className="tb-amt">{money(t.amount)}</div>}
      </div>
      <button className="tb-more" onClick={() => setMenu(menu === t.id ? null : t.id)} aria-label={tr("Move")}>
        ⋯
      </button>
      {menu === t.id && (
        <div className="tb-menu" onMouseLeave={() => setMenu(null)}>
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
  const { loc, byDay, overDay, dropProps } = useContext(Ctx);
  const list = byDay.get(day) ?? [];
  const isToday = day === todayStr();
  const d = parse(day);
  const open = list.filter((t) => t.status === "pending").length;
  return (
    <div className={`tb-col ${overDay === day ? "tb-over" : ""} ${isToday ? "tb-today" : ""}`} {...dropProps(day)}>
      <div className="tb-head">
        <span className="capitalize">{d.toLocaleDateString(loc, { weekday: big ? "long" : "short" }).replace(".", "")}</span>
        <span className={`tb-num ${isToday ? "tb-num-on" : ""}`}>{d.getDate()}</span>
        {big && <span className="faint text-xs capitalize">{d.toLocaleDateString(loc, { month: "long", year: "numeric" })}</span>}
        {open > 0 && <span className="faint ml-auto text-[11px]">{open}</span>}
      </div>
      <div className="tb-lines">
        {list.map((t) => (
          <Row key={t.id} t={t} day={day} />
        ))}
        <NewLine day={day} />
      </div>
    </div>
  );
}

