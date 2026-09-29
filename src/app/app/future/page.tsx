import { redirect } from "next/navigation";

// merged into /app/forecast?tab=wealth
export default function Page() {
  redirect("/app/forecast?tab=wealth");
}
