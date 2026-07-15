import Link from "next/link";
import { Wordmark, LogoMark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

const features = [
  {
    title: "Your whole month, one page",
    text: "Income, expenses, debts and investments — organized your way, logged in two taps.",
  },
  {
    title: "Dates that matter",
    text: "“This debt dies in June 2029.” Payoff dates, statement closes, and a 12-month forecast that already knows about three-paycheck months.",
  },
  {
    title: "Private beta",
    text: "We're letting people in gradually. Have an invite code? You're in. Bank connections and smart insights are on the way.",
  },
];

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 pb-16">
      <header className="flex items-center justify-between py-6">
        <Wordmark />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
        </div>
      </header>

      <section className="mt-14 text-center">
        <div className="mx-auto mb-6 w-fit">
          <LogoMark size={64} />
        </div>
        <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">
          Your money, <span className="text-grad">under control.</span>
        </h1>
        <p className="muted mx-auto mt-4 max-w-md text-lg">
          Track spending, set monthly budgets, and turn money chores into
          check-offable tasks that update your budget for you.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="btn btn-primary">
            Join with invite code
          </Link>
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-16 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card p-6">
            <h3 className="font-display text-lg font-semibold">{f.title}</h3>
            <p className="muted mt-1.5 text-sm leading-relaxed">{f.text}</p>
          </div>
        ))}
      </section>

      <footer className="faint mt-16 text-center text-xs leading-relaxed">
        <div className="mb-2 flex justify-center gap-4">
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>
        </div>
        Montfort Money is part of the Montfort family.
        <br />© {new Date().getFullYear()} Montfort LLC. All rights reserved.
      </footer>
    </main>
  );
}
