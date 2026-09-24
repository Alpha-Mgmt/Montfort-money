"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems, isActive } from "@/components/nav-items";
import { useT } from "@/lib/i18n";

export function TabBar() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="tabbar">
      <div
        className="mx-auto grid max-w-xl"
        style={{
          gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
        }}
      >
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
      </div>
    </nav>
  );
}
