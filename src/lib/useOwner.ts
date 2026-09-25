"use client";

import { useEffect, useState } from "react";

let cached: boolean | null = null;

/** Whether the signed-in user is the owner (cached for the session). */
export function useIsOwner() {
  const [owner, setOwner] = useState<boolean>(cached ?? false);
  useEffect(() => {
    if (cached !== null) return;
    fetch("/api/admin/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        cached = !!j?.owner;
        setOwner(cached);
      })
      .catch(() => {});
  }, []);
  return owner;
}
