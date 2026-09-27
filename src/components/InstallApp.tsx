"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/i18n";

/** "Install the app" card: native prompt on Android/Chrome, steps on iPhone. Hidden once installed. */
export function InstallApp() {
  const { t } = useApp();
  const [prompt, setPrompt] = useState<any>(null);
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios" | "other">("hidden");

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (standalone) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setMode(ios ? "ios" : "other");
    const h = (e: any) => {
      e.preventDefault();
      setPrompt(e);
      setMode("prompt");
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  if (mode === "hidden") return null;
  return (
    <div className="card p-6">
      <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Get the app")}</p>
      <p className="mt-2 text-sm font-medium">{t("Put Montfort Money on your home screen")}</p>
      <p className="muted mt-1 text-sm">{t("Opens full screen like an app, with its own icon.")}</p>
      {mode === "prompt" && (
        <button
          className="btn btn-primary mt-3"
          onClick={async () => {
            prompt?.prompt();
            await prompt?.userChoice?.catch(() => null);
            setPrompt(null);
            setMode("hidden");
          }}
        >
          {t("Install app")}
        </button>
      )}
      {mode === "ios" && (
        <ol className="muted mt-3 grid gap-1 text-sm">
          <li>1. {t("In Safari, tap the Share button (the square with an arrow).")}</li>
          <li>2. {t("Choose \"Add to Home Screen\".")}</li>
          <li>3. {t("Tap \"Add\" — done.")}</li>
        </ol>
      )}
      {mode === "other" && (
        <p className="muted mt-3 text-sm">{t("In your browser menu, choose \"Install app\" or \"Add to Home screen\".")}</p>
      )}
    </div>
  );
}
