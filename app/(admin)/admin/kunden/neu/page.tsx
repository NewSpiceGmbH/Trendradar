import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { OrgEditor } from "@/components/admin/customers";
import { PageHead } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Neuer Kunde · Redaktion" };

/** Vorschlag für einen neuen Vertrag: ab heute, ein Jahr */
function contractDates(now = new Date()) {
  const inAYear = new Date(now);
  inAYear.setFullYear(now.getFullYear() + 1);
  return { today: now.toISOString().slice(0, 10), inAYear: inAYear.toISOString().slice(0, 10) };
}

export default function NewCustomerPage() {
  return (
    <Suspense fallback={null}>
      <NewCustomer />
    </Suspense>
  );
}

async function NewCustomer() {
  await connection(); // Startdatum = heute
  const { today, inAYear } = contractDates();
  return (
    <>
      <PageHead eyebrow="Redaktion" title="Neuer Kunde">Danach ladet ihr die Ansprechperson als Owner ein.</PageHead>
      <OrgEditor orgId={null} initial={{ name: "", tier: "basic", seats: 5, accessFrom: today, accessUntil: inAYear }} />
    </>
  );
}
