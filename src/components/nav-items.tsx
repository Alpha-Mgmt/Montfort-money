export const navItems = [
  {
    href: "/app",
    label: "Month",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11 12 3l9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    href: "/app/ai",
    label: "Montfort AI",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      </svg>
    ),
  },
  {
    href: "/app/forecast",
    label: "Future",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17 9 11l4 4 8-8" />
        <path d="M15 7h6v6" />
      </svg>
    ),
  },
  {
    href: "/app/settings",
    label: "More",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </svg>
    ),
  },
];


/** Desktop sidebar extras (mobile reaches them from the More page). */
export const toolItems = [
  {
    href: "/app/trips",
    label: "Trips",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 19h19" />
        <path d="M3.5 13.5 7 15l4-2-6.5-5.5 2-1 8.5 4 4-2a2 2 0 0 1 2 3.4L9 17.5l-5-2z" />
      </svg>
    ),
  },
  {
    href: "/app/summary",
    label: "Summary",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </svg>
    ),
  },
  {
    href: "/app/debts",
    label: "Debt payoff",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4v16h16" />
        <path d="M7 8l4 4 3-3 5 7" />
      </svg>
    ),
  },
  {
    href: "/app/tasks",
    label: "Tasks",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12 4 4L19 6" />
      </svg>
    ),
  },
  {
    href: "/app/business",
    label: "Business tools",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
  {
    href: "/app/remittances",
    label: "Remittances",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 2 11 13" />
        <path d="M22 2 15 22l-4-9-9-4 20-7z" />
      </svg>
    ),
  },
  {
    href: "/app/couple",
    label: "Couple",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <path d="M15 14.5c.6-.3 1.3-.5 2-.5 2.5 0 4.5 2 4.5 4.5" />
      </svg>
    ),
  },
  {
    href: "/app/subscriptions",
    label: "Subscriptions",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 3v6h-6" />
      </svg>
    ),
  },
];

/** Owner-only sections (never shown to other users; the APIs re-check). */
export const ownerItems = [
  {
    href: "/app/pamm",
    label: "PAMM accounts",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 14l3-3 3 3 5-6" />
        <circle cx="18" cy="8" r="1.5" />
      </svg>
    ),
  },
  {
    href: "/app/admin",
    label: "Owner panel",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16 11.5l1.8 1.8L21.5 9.5" />
      </svg>
    ),
  },
];

/** Tools the user has turned on. */
export function visibleTools(f: { business: boolean; remit: boolean }, hasHousehold: boolean) {
  return toolItems.filter((n) => {
    if (n.href === "/app/business") return f.business;
    if (n.href === "/app/remittances") return f.remit;
    if (n.href === "/app/overview") return f.business || hasHousehold;
    return true;
  });
}

export function isActive(href: string, pathname: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}
