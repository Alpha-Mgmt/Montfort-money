"use client";

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { setFormatLocale } from "@/lib/format";
import { es } from "@/lib/dict-es";

export type Lang = "en" | "es";
export type Space = "personal" | "business" | "shared";
export type Features = { business: boolean; remit: boolean };
export type HouseholdMember = { user_id: string; full_name: string; role: string; is_me: boolean };
export type Household = { id: string; name: string; members: HouseholdMember[] };

type Vars = Record<string, string | number>;

// Current language for plain (non-hook) calls — see tr(). The provider sets
// it before rendering any screen, and remounts screens when it changes.
let LANG: Lang = "en";

/** Translate with the current language. Safe anywhere inside AppProvider. */
export function tr(key: string, vars?: Vars): string {
  return translate(LANG, key, vars);
}

/**
 * English text is the key. Spanish comes from dict-es.ts; anything missing
 * falls back to English, so screens can be translated gradually.
 */
export function translate(lang: Lang, key: string, vars?: Vars): string {
  let s = lang === "es" ? es[key] ?? key : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Vars) => string;
  space: Space;
  switchSpace: (s: Space) => Promise<void>;
  businessName: string | null;
  taxRate: number;
  ready: boolean;
  features: Features;
  setFeature: (f: keyof Features, on: boolean) => Promise<void>;
  household: Household | null;
  refreshHousehold: () => Promise<void>;
};

const AppCtx = createContext<Ctx>({
  lang: "en",
  setLang: () => {},
  t: (k, v) => translate("en", k, v),
  space: "personal",
  switchSpace: async () => {},
  businessName: null,
  taxRate: 25,
  ready: false,
  features: { business: false, remit: false },
  setFeature: async () => {},
  household: null,
  refreshHousehold: async () => {},
});

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("mf-lang");
    if (saved === "en" || saved === "es") return saved;
  } catch {}
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es"))
    return "es";
  return "en";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [space, setSpace] = useState<Space>("personal");
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState(25);
  const [ready, setReady] = useState(false);
  const [langReady, setLangReady] = useState(false);
  const [features, setFeatures] = useState<Features>({ business: false, remit: false });
  const [household, setHousehold] = useState<Household | null>(null);

  const refreshHousehold = useCallback(async () => {
    const { data, error } = await createClient().rpc("my_household_info");
    if (error || !data || !(data as any[]).length) {
      setHousehold(null);
      return;
    }
    const rows = data as any[];
    setHousehold({
      id: rows[0].household_id,
      name: rows[0].household_name,
      members: rows.map((r) => ({ user_id: r.user_id, full_name: r.full_name, role: r.role, is_me: r.is_me })),
    });
  }, []);

  const setFeature = useCallback(async (f: keyof Features, on: boolean) => {
    setFeatures((cur) => ({ ...cur, [f]: on }));
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update(f === "business" ? { feature_business: on } : { feature_remit: on })
      .eq("id", user.id);
    // turning Business off while inside it: go back to Personal
    if (f === "business" && !on && space === "business") {
      await supabase.rpc("set_space", { p_space: "personal" });
      window.location.reload();
    }
  }, [space]);

  const applyLang = useCallback((l: Lang) => {
    LANG = l;
    setFormatLocale(l);
    document.documentElement.lang = l;
    setLangState(l);
  }, []);

  useEffect(() => {
    applyLang(initialLang());
    setLangReady(true);
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("active_space,lang,business_name,tax_rate,feature_business,feature_remit")
      .single()
      .then(async ({ data }) => {
        if (data) {
          if (data.active_space === "business" || data.active_space === "shared") setSpace(data.active_space);
          setFeatures({ business: !!data.feature_business, remit: !!data.feature_remit });
          setBusinessName(data.business_name ?? null);
          if (data.tax_rate != null) setTaxRate(Number(data.tax_rate));
          // a language saved on the account wins over the browser guess
          let stored: string | null = null;
          try { stored = localStorage.getItem("mf-lang"); } catch {}
          if (!stored && (data.lang === "en" || data.lang === "es") && data.lang !== LANG) {
            applyLang(data.lang);
            try { localStorage.setItem("mf-lang", data.lang); } catch {}
          }
        }
        await refreshHousehold();
        setReady(true);
      });
    // an invite link opened before signing in: pick it up now
    try {
      const m = document.cookie.match(/(?:^|; )mf-join=([A-Z0-9]+)/);
      if (m && !window.location.pathname.startsWith("/app/join")) {
        document.cookie = "mf-join=; path=/; max-age=0";
        window.location.href = `/app/join?code=${m[1]}`;
      }
    } catch {}
  }, [applyLang, refreshHousehold]);

  const setLang = useCallback((l: Lang) => {
    applyLang(l);
    try { localStorage.setItem("mf-lang", l); } catch {}
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user)
          createClient().from("profiles").update({ lang: l }).eq("id", data.user.id);
      });
  }, [applyLang]);

  const switchSpace = useCallback(async (s: Space) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("set_space", { p_space: s });
    if (error) {
      alert(translate(lang, "Could not switch. Try again."));
      return;
    }
    if (s === "business") await seedBusinessCategories(lang);
    if (s === "shared") await seedSharedCategories(lang);
    // every screen refetches under the new space
    window.location.reload();
  }, [lang]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: (k, v) => translate(lang, k, v),
      space,
      switchSpace,
      businessName,
      taxRate,
      ready,
      features,
      setFeature,
      household,
      refreshHousehold,
    }),
    [lang, setLang, space, switchSpace, businessName, taxRate, ready, features, setFeature, household, refreshHousehold]
  );

  // Render screens only once the language is known (no English flash), and
  // remount them when it changes so every tr() call picks up the new one.
  return (
    <AppCtx.Provider value={value}>
      {langReady ? <Fragment key={lang}>{children}</Fragment> : null}
    </AppCtx.Provider>
  );
}

export function useApp() {
  return useContext(AppCtx);
}

export function useT() {
  return useContext(AppCtx).t;
}

/** First visit to Business: give it a sensible starting set of categories. */
async function seedBusinessCategories(lang: Lang) {
  const supabase = createClient();
  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const rows: [string, string, "expense" | "income"][] = [
    ["Sales", "🧾", "income"],
    ["Services", "🛠️", "income"],
    ["Other income", "➕", "income"],
    ["Supplies & materials", "📦", "expense"],
    ["Software & tools", "💻", "expense"],
    ["Marketing", "📣", "expense"],
    ["Vehicle & fuel", "🚚", "expense"],
    ["Contractors", "🤝", "expense"],
    ["Rent & utilities", "🏢", "expense"],
    ["Fees & bank charges", "🏦", "expense"],
    ["Insurance", "🛡️", "expense"],
    ["Taxes", "🏛️", "expense"],
  ];
  await supabase.from("categories").insert(
    rows.map(([name, icon, kind]) => ({
      user_id: user.id,
      name: translate(lang, name),
      icon,
      kind,
      space: "business",
    }))
  );
}

/** First visit to the couple space: household basics. */
async function seedSharedCategories(lang: Lang) {
  const supabase = createClient();
  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const rows: [string, string, "expense" | "income"][] = [
    ["Contributions", "🤝", "income"],
    ["Housing", "🏠", "expense"],
    ["Groceries", "🛒", "expense"],
    ["Utilities", "💡", "expense"],
    ["Dining out", "🍽️", "expense"],
    ["Kids", "🧸", "expense"],
    ["Pets", "🐾", "expense"],
    ["Travel", "✈️", "expense"],
    ["Home & furniture", "🛋️", "expense"],
  ];
  await supabase.from("categories").insert(
    rows.map(([name, icon, kind]) => ({ user_id: user.id, name: translate(lang, name), icon, kind }))
  );
}
