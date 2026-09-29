"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { openQuickLog } from "@/components/QuickLog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SpaceSwitcher, LangToggle } from "@/components/SpaceSwitcher";
import { navItems, visibleTools, ownerItems, isActive } from "@/components/nav-items";
import { useIsOwner } from "@/lib/useOwner";
import { useApp } from "@/lib/i18n";

export function Sidebar() {
  const pathname = usePathname();
  const { t, features, household } = useApp();
  const owner = useIsOwner();
  return (
    <aside className="sidebar">
      <Link href="/app">
        <Wordmark />
      </Link>
      <div className="mt-5">
        <SpaceSwitcher compact />
      </div>
      <button
        onClick={openQuickLog}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white"
        style={{ background: "linear-gradient(120deg, #0ea472, #0d8bd9)", boxShadow: "0 6px 18px rgba(14,139,170,.25)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        {t("Log money")}
      </button>
      <nav>
        {navItems.filter((n) => n.href !== "/app/settings").map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={isActive(n.href, pathname) ? "active" : ""}
          >
            {n.icon}
            {t(n.label)}
          </Link>
        ))}
        <p className="faint mt-4 px-3 text-[11px] font-semibold uppercase tracking-wide">
          {t("Tools")}
        </p>
        {visibleTools(features, !!household).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={isActive(n.href, pathname) ? "active" : ""}
          >
            {n.icon}
            {t(n.label)}
          </Link>
        ))}
        {owner && (
          <>
            <p className="faint mt-4 px-3 text-[11px] font-semibold uppercase tracking-wide">
              {t("Owner")}
            </p>
            {ownerItems.map((n) => (
              <Link key={n.href} href={n.href} className={isActive(n.href, pathname) ? "active" : ""}>
                {n.icon}
                {t(n.label)}
              </Link>
            ))}
          </>
        )}
      </nav>
      <nav className="!mt-auto pt-4">
        {navItems.filter((n) => n.href === "/app/settings").map((n) => (
          <Link key={n.href} href={n.href} className={isActive(n.href, pathname) ? "active" : ""}>
            {n.icon}
            {t(n.label)}
          </Link>
        ))}
      </nav>
      <div className="mt-3 flex items-center justify-between gap-2">
        <LangToggle />
        <ThemeToggle />
      </div>
    </aside>
  );
}
