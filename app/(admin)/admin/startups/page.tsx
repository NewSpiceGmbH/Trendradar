import { permanentRedirect } from "next/navigation";

/** Die Startup-Datenbank ist in der Netzwerk-Datenbank aufgegangen (Migration 0014) */
export default function StartupsPage() {
  permanentRedirect("/admin/netzwerk?typ=solution_provider");
}
