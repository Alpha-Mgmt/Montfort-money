export const navItems = [
  {
    href: "/app",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11 12 3l9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    href: "/app/forecast",
    label: "Forecast",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17 9 11l4 4 8-8" />
        <path d="M15 7h6v6" />
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

export function isActive(href: string, pathname: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}
