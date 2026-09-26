"use client";

import { useState } from "react";

/** Password field with a show/hide eye button. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  showLabel = "Show password",
  hideLabel = "Hide password",
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  showLabel?: string;
  hideLabel?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        required
        className="input !pr-11"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? hideLabel : showLabel}
        aria-pressed={show}
        className="faint absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg hover:opacity-80"
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

/** Strength rules shared by sign-up and password reset. */
export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 10) out.push("at least 10 characters");
  if (!/[a-z]/i.test(pw)) out.push("a letter");
  if (!/\d/.test(pw)) out.push("a number");
  if (!/[^a-z0-9]/i.test(pw)) out.push("a symbol (like ! # $ %)");
  if (/^(.)\1+$/.test(pw) || /password|contrase|12345|qwerty|montfort/i.test(pw)) out.push("not something easy to guess");
  return out;
}

/** Checklist under a new-password field. */
export function PasswordRules({ value }: { value: string }) {
  const rules: [string, boolean][] = [
    ["10+ characters", value.length >= 10],
    ["A letter", /[a-z]/i.test(value)],
    ["A number", /\d/.test(value)],
    ["A symbol", /[^a-z0-9]/i.test(value)],
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {rules.map(([label, ok]) => (
        <span key={label} style={{ color: ok ? "var(--mint)" : "var(--text-faint)" }}>
          {ok ? "✓" : "○"} {label}
        </span>
      ))}
    </div>
  );
}
