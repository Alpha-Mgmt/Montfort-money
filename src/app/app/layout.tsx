import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TabBar } from "@/components/TabBar";
import { Sidebar } from "@/components/Sidebar";
import { SpaceSwitcher } from "@/components/SpaceSwitcher";
import { AppProvider } from "@/lib/i18n";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppProvider>
      <Sidebar />
      <div className="with-sidebar">
        <div className="mx-auto min-h-screen max-w-[1500px] px-4 pb-28 lg:px-10 lg:pb-12">
          <header className="grid gap-3 py-4 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link href="/app" className="whitespace-nowrap">
                <Wordmark />
              </Link>
              <ThemeToggle />
            </div>
            <div className="w-full max-w-[16rem]">
              <SpaceSwitcher compact />
            </div>
          </header>
          <div className="lg:pt-8">{children}</div>
        </div>
      </div>
      <TabBar />
    </AppProvider>
  );
}
