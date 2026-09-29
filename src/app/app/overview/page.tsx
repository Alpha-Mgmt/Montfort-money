import { redirect } from "next/navigation";

// merged into /app/summary?tab=spaces
export default function Page() {
  redirect("/app/summary?tab=spaces");
}
