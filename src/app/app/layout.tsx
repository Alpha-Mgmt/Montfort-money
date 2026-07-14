import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TabBar } from "@/components/TabBar";
import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Sidebar />
      <div className="with-sidebar">
        <div className="mx-auto min-h-screen max-w-[1500px] px-4 pb-28 lg:px-10 lg:pb-12">
          <header className="flex items-center justify-between py-4 lg:hidden">
            <Link href="/app">
              <Wordmark />
            </Link>
            <ThemeToggle />
          </header>
          <div className="lg:pt-8">{children}</div>
        </div>
      </div>
      <TabBar />
    </>
  );
}
