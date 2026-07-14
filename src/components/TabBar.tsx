"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems, isActive } from "@/components/nav-items";

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar">
      <div
        className="mx-auto grid max-w-xl"
        style={{
          gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
        }}
      >
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
      </div>
    </nav>
  );
}
