"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { navItems, isActive } from "@/components/nav-items";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/app">
        <Wordmark />
      </Link>
      <nav>
        {navItems.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={isActive(t.href, pathname) ? "active" : ""}
          >
            {t.icon}
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between">
        <span className="faint text-xs">Private beta</span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
