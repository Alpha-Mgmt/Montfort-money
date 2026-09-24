"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SpaceSwitcher, LangToggle } from "@/components/SpaceSwitcher";
import { navItems, toolItems, isActive } from "@/components/nav-items";
import { useT } from "@/lib/i18n";

export function Sidebar() {
  const pathname = usePathname();
  const t = useT();
  return (
    <aside className="sidebar">
      <Link href="/app">
        <Wordmark />
      </Link>
      <div className="mt-5">
        <SpaceSwitcher compact />
      </div>
      <nav>
        {navItems.map((n) => (
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
        {toolItems.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={isActive(n.href, pathname) ? "active" : ""}
          >
            {n.icon}
            {t(n.label)}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2">
        <LangToggle />
        <ThemeToggle />
      </div>
    </aside>
  );
}
