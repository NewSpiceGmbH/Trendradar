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
      <form action={logout}>
        <button className="rounded-[var(--radius-pill)] border border-line px-3 py-1.5 text-sm text-ink hover:border-muted">Abmelden</button>
      </form>
    </div>
  );
}
