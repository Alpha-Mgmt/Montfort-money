"use client";

import { tr } from "@/lib/i18n";
import { defaultSchedule, scheduleStart, toISO } from "@/lib/recurring";
import type { Frequency, Schedule } from "@/lib/types";

export type When = { start_date: string; schedule: Schedule | null };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const md = (iso: string) => iso.slice(5, 10);
const thisYear = (mmdd: string) => `${new Date().getFullYear()}-${mmdd}`;

/** The when for a new frequency, anchored on `anchor` (YYYY-MM-DD). */
export function whenFor(freq: Frequency | "none", anchor: string): When {
  const schedule = defaultSchedule(freq, anchor);
  return {
    start_date: freq === "none" ? anchor : scheduleStart(freq as Frequency, schedule, anchor),
    schedule,
  };
}

/**
 * Pick the actual day(s) for a repeat: weekday for weekly, next date for
 * every-2-weeks, day of month, two days a month, or specific dates a year.
 */
export function WhenPicker({
  freq,
  value,
  onChange,
  compact = false,
}: {
  freq: Frequency | "none";
  value: When;
  onChange: (w: When) => void;
  compact?: boolean;
}) {
  const sel = `input !w-auto ${compact ? "!py-1 !px-2 text-xs" : "!py-1.5 !px-2 text-sm"}`;
  const lbl = "faint text-xs";
  const sch = value.schedule ?? {};

  if (freq === "weekly") {
    const wd = parse(value.start_date).getDay();
    const pick = (d: number) => {
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      t.setDate(t.getDate() + ((d - t.getDay() + 7) % 7));
      onChange({ start_date: toISO(t), schedule: null });
    };
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={lbl}>{tr("Every")}</span>
        {WEEKDAYS.map((w, i) => (
          <button
            key={w}
            type="button"
            className={`btn !px-2 !py-0.5 !text-xs ${wd === i ? "btn-primary" : "btn-ghost"}`}
            onClick={() => pick(i)}
          >
            {tr(w)}
          </button>
        ))}
      </div>
    );
  }

  if (freq === "biweekly" || freq === "yearly" || freq === "once" || freq === "quarterly" || freq === "none") {
    const label =
      freq === "biweekly" ? tr("Next payment") : freq === "quarterly" ? tr("First payment") : tr("Date");
    return (
      <label className="flex flex-wrap items-center gap-1.5">
        <span className={lbl}>{label}</span>
        <input
          type="date"
          className={sel}
          value={value.start_date}
          onChange={(e) =>
            e.target.value &&
            onChange({
              start_date: e.target.value,
              schedule: freq === "quarterly" ? { day: parse(e.target.value).getDate() } : null,
            })
          }
        />
      </label>
    );
  }

  if (freq === "monthly") {
    const day = sch.day ?? parse(value.start_date).getDate();
    return (
      <label className="flex flex-wrap items-center gap-1.5">
        <span className={lbl}>{tr("On day")}</span>
        <select
          className={sel}
          value={day}
          onChange={(e) => {
            const s = { day: Number(e.target.value) };
            onChange({ start_date: scheduleStart("monthly", s, value.start_date), schedule: s });
          }}
        >
          {DAYS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {day > 28 && <span className={lbl}>{tr("(last day in shorter months)")}</span>}
      </label>
    );
  }

  if (freq === "semimonthly") {
    const days = sch.days?.length === 2 ? sch.days : [15, 30];
    const set = (i: number, v: number) => {
      const d = [...days];
      d[i] = v;
      onChange({ start_date: value.start_date, schedule: { days: d } });
    };
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={lbl}>{tr("On days")}</span>
        {[0, 1].map((i) => (
          <select key={i} className={sel} value={days[i]} onChange={(e) => set(i, Number(e.target.value))}>
            {DAYS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        ))}
      </div>
    );
  }

  // twice a year / custom: dates that repeat every year
  const dates = sch.dates?.length ? sch.dates : defaultSchedule(freq, value.start_date)?.dates ?? [];
  const setDates = (d: string[]) =>
    onChange({ start_date: value.start_date, schedule: { dates: [...d].sort() } });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={lbl}>{tr("On the dates")}</span>
      {dates.map((d, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <input
            type="date"
            className={sel}
            value={thisYear(d)}
            onChange={(e) => {
              if (!e.target.value) return;
              const n = [...dates];
              n[i] = md(e.target.value);
              setDates(n);
            }}
          />
          {freq === "custom" && dates.length > 1 && (
            <button
              type="button"
              className="faint px-1 text-sm"
              aria-label={tr("Remove date")}
              onClick={() => setDates(dates.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {freq === "custom" && dates.length < 24 && (
        <button
          type="button"
          className="faint text-xs underline underline-offset-4"
          onClick={() => {
            // next date: one month after the last one
            const last = parse(thisYear(dates[dates.length - 1] ?? md(value.start_date)));
            const n = new Date(last.getFullYear(), last.getMonth() + 1, last.getDate());
            setDates([...dates, md(toISO(n))]);
          }}
        >
          {tr("+ add date")}
        </button>
      )}
      <span className={lbl}>{tr("every year")}</span>
    </div>
  );
}
