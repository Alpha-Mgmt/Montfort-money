"use client";

import Link from "next/link";
import { useIsOwner } from "@/lib/useOwner";

/** Cuentas PAMM — owner-only. The original page runs inside a frame and
 *  reads/saves through /api/pamm (which re-checks owner + 2FA). */
export default function PammPage() {
  const owner = useIsOwner();
  if (!owner)
    return (
      <div className="card p-6">
        <p className="font-medium">Esta sección es solo para el dueño.</p>
        <Link href="/app" className="btn btn-ghost mt-4 inline-flex">Volver</Link>
      </div>
    );
  return (
    <div className="-mx-4 sm:mx-0">
      <iframe
        src="/pamm/index.html"
        title="Cuentas PAMM"
        className="block w-full rounded-3xl border-0"
        style={{ height: "calc(100vh - 7rem)", minHeight: 640, background: "#F4F7FB" }}
      />
    </div>
  );
}
