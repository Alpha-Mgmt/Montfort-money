import Link from "next/link";
import { Wordmark } from "@/components/Logo";

export const metadata = {
  title: "Terms of Service · Montfort Money",
};

export default function TermsPage() {
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
        <h1 className="font-display text-3xl font-semibold">
          Terms of Service
        </h1>
        <p className="faint mt-1 text-sm">Last updated: July 15, 2026</p>

        <div className="mt-6 grid gap-5 text-sm leading-relaxed">
          <p className="muted">
            These terms are the agreement between you and Montfort LLC
            (“Montfort,” “we,” “us”) for using Montfort Money. By creating an
            account or using the app, you agree to them.
          </p>

          <Section title="What Montfort Money is">
            <p>
              Montfort Money is a personal budgeting tool that helps you track
              income, expenses, debts, investments and goals, and offers
              AI-generated insights based on the information you enter.
            </p>
          </Section>

          <Section title="Not financial advice">
            <p>
              Montfort Money is for informational and organizational purposes
              only. It is <b>not</b> financial, investment, tax, or legal
              advice, and we are not a licensed financial advisor, broker, or
              accountant. The insights and figures — including forecasts,
              payoff dates, and AI answers — are estimates based on the data you
              provide. Always do your own research and consider consulting a
              licensed professional before making financial decisions.
            </p>
          </Section>

          <Section title="Your account">
            <p>
              During the private beta you need a valid invite code to join.
              You’re responsible for keeping your login secure and for the
              activity on your account. Tell us right away if you suspect
              unauthorized access. You must be at least 18 to use Montfort
              Money.
            </p>
          </Section>

          <Section title="Your data is yours">
            <p>
              You own the information you enter. You’re responsible for its
              accuracy — the app’s calculations are only as good as the numbers
              you give it. You can edit, export by contacting us, or delete your
              data at any time.
            </p>
          </Section>

          <Section title="Acceptable use">
            <p>
              Don’t use Montfort Money to break the law, infringe others’
              rights, attempt to access other users’ data, disrupt or reverse
              engineer the service, or abuse the AI features. We may suspend
              accounts that do.
            </p>
          </Section>

          <Section title="Beta software — “as is”">
            <p>
              Montfort Money is provided in beta, “as is” and “as available,”
              without warranties of any kind. Features may change, break, or be
              removed, and data could occasionally be lost. To the fullest
              extent permitted by law, Montfort LLC is not liable for any
              indirect, incidental, or consequential damages, or for financial
              decisions you make using the app. Keep your own records for
              anything important.
            </p>
          </Section>

          <Section title="Third-party services">
            <p>
              The app runs on third-party providers (including Supabase, Vercel
              and Anthropic). Your use of Montfort Money is also subject to how
              those providers operate, as described in our{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
              .
            </p>
          </Section>

          <Section title="Termination">
            <p>
              You can stop using Montfort Money and delete your account anytime.
              We may suspend or end access if these terms are violated or if we
              discontinue the service.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              We may update these terms as the product evolves. If we make
              material changes, we’ll update the date above and, where
              appropriate, let you know in the app.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions? Email{" "}
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
        <Link href="/privacy" className="underline">
          Privacy Policy
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
