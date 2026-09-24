import Link from "next/link";
import { Wordmark } from "@/components/Logo";

export const metadata = {
  title: "Privacy Policy · Montfort Money",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 pb-20">
      <header className="flex items-center justify-between py-6">
        <Link href="/">
          <Wordmark />
        </Link>
        <Link href="/" className="faint text-sm hover:underline">
          ← Back
        </Link>
      </header>

      <div className="card p-8">
        <h1 className="font-display text-3xl font-semibold">Privacy Policy</h1>
        <p className="faint mt-1 text-sm">Last updated: September 24, 2026</p>

        <div className="prose-mf mt-6 grid gap-5 text-sm leading-relaxed">
          <p className="muted">
            Montfort Money (“Montfort,” “we,” “us”) is a personal budgeting app
            operated by Montfort LLC. This policy explains what we collect, why,
            and the choices you have. We keep it plain on purpose.
          </p>

          <Section title="What we collect">
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <b>Account info</b> — your name and email address.
              </li>
              <li>
                <b>The financial information you enter</b> — income, expenses,
                categories, budgets, debts, investments, goals, tasks and notes.
                You type this in yourself.
              </li>
              <li>
                <b>Bank data (only if you connect a bank)</b> — if you choose to
                link an account, we use Plaid Inc. (“Plaid”) to receive account
                names, balances and transactions from your bank. We never see or
                store your bank username or password.
              </li>
              <li>
                <b>Basic usage data</b> — anonymous analytics about how the app
                is used, so we can improve it.
              </li>
            </ul>
          </Section>

          <Section title="How we use it">
            <p>
              We use your information only to run Montfort Money: to show you
              your budget, calculate forecasts, generate the AI insights and
              answers you request, and improve the product. We do not sell your
              personal information, and we don’t show ads.
            </p>
          </Section>

          <Section title="Bank connections and Plaid">
            <p>
              Connecting a bank is optional and requires two-step verification.
              Before any data is shared, Plaid shows you which institution and
              accounts are involved and asks for your consent. By connecting, you
              acknowledge that Plaid collects and processes your information
              under the{" "}
              <a
                className="underline"
                href="https://plaid.com/legal/#end-user-privacy-policy"
                target="_blank"
                rel="noreferrer"
              >
                Plaid End User Privacy Policy
              </a>
              . You can disconnect a bank at any time from More → Settings; we
              then revoke our access with Plaid and stop receiving new data.
            </p>
          </Section>

          <Section title="AI features">
            <p>
              When you use “Montfort AI” (the monthly insights or the chat), a
              summary of your financial data for that month is sent to our AI
              provider, Anthropic, to generate the response. Anthropic processes
              it to return an answer and, per their terms, does not use it to
              train their models. We never send your password. You control when
              this happens — the AI only runs when you ask it to.
            </p>
          </Section>

          <Section title="Where your data lives">
            <p>
              Your data is stored with our infrastructure providers — Supabase
              (database) and Vercel (hosting) — on servers in the United States,
              encrypted in transit (TLS) and at rest (AES-256). Access is protected by row-level security so
              each account can only reach its own data.
            </p>
          </Section>

          <Section title="Who we share it with">
            <p>
              We share data only with the service providers that make the app
              work — Supabase (storage), Vercel (hosting), Plaid (bank
              connections, only if you use them) and Anthropic (AI features) — and only as needed to provide the service. We may
              disclose information if required by law. We do not sell your data.
            </p>
          </Section>

          <Section title="Your choices">
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <b>Edit or delete</b> any entry at any time inside the app.
              </li>
              <li>
                <b>Reset everything</b> from More → Danger zone to wipe your
                financial data.
              </li>
              <li>
                <b>Delete your account and data</b> — email us and we’ll remove
                your account and associated data.
              </li>
            </ul>
          </Section>

          <Section title="Data retention">
            <p>
              We keep your data only while your account is active. When you
              disconnect a bank, we revoke access with Plaid and delete the stored
              connection credentials immediately; past transactions stay in your
              budget until you delete them. When you ask us to delete your
              account, we delete your account and all associated financial data
              within 30 days; encrypted backups roll off within 7 more days. We
              review this policy at least once a year.
            </p>
          </Section>

          <Section title="Children">
            <p>
              Montfort Money is not intended for anyone under 18, and we don’t
              knowingly collect information from children.
            </p>
          </Section>

          <Section title="Early access">
            <p>
              Montfort Money is new and evolving quickly. We may
              update this policy as features change; we’ll update the date above
              when we do.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions or requests? Email{" "}
              <a
                className="underline"
                href="mailto:hello@montfortfinancial.com"
              >
                hello@montfortfinancial.com
              </a>
              .
            </p>
          </Section>
        </div>
      </div>

      <p className="faint mt-6 text-center text-xs">
        <Link href="/terms" className="underline">
          Terms of Service
        </Link>
      </p>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-1.5">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <div className="muted">{children}</div>
    </section>
  );
}
