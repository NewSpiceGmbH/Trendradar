import type { Metadata } from "next";
import Link from "next/link";
import { NewMemberForm } from "@/components/admin/network";
import { PageHead } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Neuer Eintrag · Netzwerk-Datenbank" };

export default function NewMemberPage() {
  return (
    <>
      <PageHead eyebrow="Netzwerk-Datenbank" title="Neuer Eintrag">
        Manuell anlegen, z. B. nach einem Gespräch. Angebot, Referenzen und Kontakt ergänzt ihr danach im Eintrag. <Link href="/admin/netzwerk">← Zur Datenbank</Link>
      </PageHead>
      <NewMemberForm />
    </>
  );
}
