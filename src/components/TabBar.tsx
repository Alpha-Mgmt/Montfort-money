"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems, isActive } from "@/components/nav-items";
import { useT } from "@/lib/i18n";
import { openQuickLog } from "@/components/QuickLog";

/** Phone tab bar: Month · AI · [+ log] · Future · More */
export function TabBar() {
  const pathname = usePathname();
  const t = useT();
  const link = (n: (typeof navItems)[number]) => (
    <Link key={n.href} href={n.href} className={isActive(n.href, pathname) ? "active" : ""}>
      {n.icon}
      {t(n.label)}
    </Link>
  );
  return (
    <nav className="tabbar">
      <div className="mx-auto grid max-w-xl grid-cols-5 items-center">
        {navItems.slice(0, 2).map(link)}
        <div className="flex justify-center">
          <button
            onClick={openQuickLog}
            aria-label={t("Log money")}
            className="-mt-5 grid h-14 w-14 place-items-center rounded-full text-white shadow-lg"
            style={{ background: "linear-gradient(135deg, #0ea472, #0d8bd9)", boxShadow: "0 8px 20px rgba(14,139,170,.35)" }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        {navItems.slice(2).map(link)}
      </div>
    </nav>
  );
}
