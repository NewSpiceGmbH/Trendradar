import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";

/** Alte Adresse eines Startup-Profils → Eintrag in der Netzwerk-Datenbank */
export default function StartupPage(props: PageProps<"/admin/startups/[id]">) {
  return (
    <Suspense>
      <Forward params={props.params} />
    </Suspense>
  );
}

async function Forward({ params }: { params: PageProps<"/admin/startups/[id]">["params"] }) {
  const { id } = await params;
  permanentRedirect(`/admin/netzwerk/${id}?reiter=bearbeiten`);
  return null;
}
