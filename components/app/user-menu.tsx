import Link from "next/link";
import { logout } from "@/lib/auth/actions";
import { getViewer } from "@/lib/auth/viewer";

export async function UserMenu() {
  const v = await getViewer();
  if (!v) return null;
  const org = v.activeOrg ?? v.orgs[0];
  const role = v.isEditor
    ? v.platformRole === "admin" ? "Redaktion · Admin" : "Redaktion"
    : org
      ? `${org.name} · ${org.role === "owner" ? "Owner" : "Member"} · ${org.tier === "premium" ? "Premium" : "Basic"}`
      : "ohne Organisation";
  return (
    <div className="flex items-center gap-3">
      <div className="hidden flex-col items-end leading-tight sm:flex">
        <span className="text-sm font-bold text-ink">{v.name}</span>
        <span className="text-xs text-muted">{role}</span>
      </div>
      {v.isEditor && (
        <Link href="/admin" className="rounded-[var(--radius-pill)] border border-line px-3 py-1.5 text-sm font-bold text-ink no-underline hover:border-muted">
          Redaktion
        </Link>
      )}
      <form action={logout}>
        <button aria-label="Abmelden" title="Abmelden" className="rounded-[var(--radius-pill)] border border-line px-2.5 py-1.5 text-sm text-ink hover:border-muted sm:px-3">
          <span className="hidden sm:inline">Abmelden</span>
          {/* am Handy nur ein Symbol, damit die Navigation Platz hat */}
          <svg aria-hidden viewBox="0 0 24 24" className="size-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" />
          </svg>
        </button>
      </form>
    </div>
  );
}
