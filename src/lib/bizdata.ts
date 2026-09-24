"use client";

import { createClient } from "@/lib/supabase/client";
import type { Invoice } from "@/lib/cashflow";

export type Counterparty = {
  id: string;
  kind: "client" | "vendor";
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export type BizTx = {
  id: string;
  kind: "income" | "expense";
  amount: number;
  tx_date: string;
  note: string | null;
  category_id: string | null;
  counterparty_id: string | null;
  deductible: boolean;
  receipt_path: string | null;
};

export async function fetchCounterparties(): Promise<Counterparty[]> {
  const { data } = await createClient()
    .from("counterparties")
    .select("id,kind,name,email,phone,notes")
    .eq("archived", false)
    .order("name");
  return (data ?? []) as Counterparty[];
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data } = await createClient()
    .from("invoices")
    .select("id,number,client_id,issue_date,due_date,amount,status,paid_on,items,notes")
    .order("issue_date", { ascending: false })
    .limit(500);
  return ((data ?? []) as any[]).map((i) => ({
    ...i,
    amount: Number(i.amount),
    items: Array.isArray(i.items) ? i.items : [],
  })) as Invoice[];
}

export async function fetchBizTx(from: string, to: string): Promise<BizTx[]> {
  const { data } = await createClient()
    .from("transactions")
    .select("id,kind,amount,tx_date,note,category_id,counterparty_id,deductible,receipt_path")
    .gte("tx_date", from)
    .lt("tx_date", to)
    .order("tx_date", { ascending: false })
    .limit(3000);
  return ((data ?? []) as any[]).map((t) => ({
    ...t,
    amount: Number(t.amount),
    deductible: !!t.deductible,
  })) as BizTx[];
}

export async function uid(): Promise<string | null> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return user?.id ?? null;
}

/** Upload a receipt photo/PDF to receipts/<uid>/…; returns the storage path. */
export async function uploadReceipt(file: File): Promise<string | null> {
  const me = await uid();
  if (!me) return null;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${me}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await createClient().storage.from("receipts").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  return error ? null : path;
}

export async function receiptUrl(path: string): Promise<string | null> {
  const { data } = await createClient().storage.from("receipts").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
