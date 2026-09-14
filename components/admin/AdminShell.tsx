"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type AdminSessionState = "checking" | "out" | "in" | "unconfigured";

/**
 * Every admin page sits inside this: the password gate (the password is
 * only ever checked on the server, see lib/adminAuth.ts — this posts it
 * and relies on the httpOnly cookie that comes back) and the section
 * navigation.
 */
export const ADMIN_SECTIONS = [
  { href: "/admin/dashboard", label: "اللوحة" },
  { href: "/admin", label: "المنتجات" },
  { href: "/admin/orders", label: "الطلبات" },
  { href: "/admin/customers", label: "العملاء" },
  { href: "/admin/reviews", label: "التقييمات" },
  { href: "/admin/content", label: "المحتوى" },
  { href: "/admin/settings", label: "الإعدادات" },
];

export function useAdminSession() {
  const [session, setSession] = useState<AdminSessionState>("checking");
  useEffect(() => {
    fetch("/api/admin/session")
      .then((res) => res.json())
      .then((body: { configured?: boolean; authenticated?: boolean }) => {
        if (!body.configured) setSession("unconfigured");
        else setSession(body.authenticated ? "in" : "out");
      })
      .catch(() => setSession("out"));
  }, []);
  return { session, setSession };
}

export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { session, setSession } = useAdminSession();
  const pathname = usePathname();

  if (session !== "in") {
    return <AdminLogin state={session} onAuthenticated={() => setSession("in")} />;
  }

  return (
    <div className="py-8 sm:py-12">
      <Container>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {actions}
            <Button href="/" variant="secondary" size="sm">
              عرض المتجر
            </Button>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/admin/session", { method: "DELETE" });
                setSession("out");
              }}
              className="rounded-full border border-line px-4 py-1.5 text-xs font-bold text-ink-soft transition hover:border-accent/40 hover:text-ink"
            >
              خروج
            </button>
          </div>
        </div>

        <nav className="hide-scrollbar mb-8 flex gap-1.5 overflow-x-auto rounded-full border border-line bg-surface-2 p-1.5">
          {ADMIN_SECTIONS.map((s) => {
            const active = pathname === s.href;
            return (
              <Link
                key={s.href}
                href={s.href}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-bold transition",
                  active ? "bg-accent text-accent-contrast shadow-[0_8px_22px_-12px_var(--accent)]" : "text-ink-soft hover:text-ink"
                )}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </Container>
    </div>
  );
}

function AdminLogin({ state, onAuthenticated }: { state: AdminSessionState; onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "تعذّر تسجيل الدخول.");
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تسجيل الدخول.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-16">
      <Container>
        <div className="mx-auto max-w-sm rounded-3xl border border-line bg-surface-2 p-6">
          <h1 className="font-display text-xl font-extrabold text-ink">لوحة الإدارة</h1>

          {state === "checking" && <p className="mt-3 text-sm text-muted">جاري التحقق…</p>}

          {state === "unconfigured" && (
            <p className="mt-3 text-sm leading-6 text-danger">
              لم يتم تعيين <code>ADMIN_PASSWORD</code> على هذا السيرفر، فلوحة التحكم معطّلة. أضفها إلى ملف <code>.env</code> وأعد
              تشغيل الحاوية.
            </p>
          )}

          {(state === "out" || state === "in") && (
            <form onSubmit={submit} className="mt-4">
              <label className="block text-xs font-bold text-ink-soft">كلمة المرور</label>
              <input
                type="password"
                value={password}
                autoFocus
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                className="field mt-1"
              />
              {error && <p className="mt-2 text-[11px] font-bold text-danger">{error}</p>}
              <Button type="submit" variant="primary" size="md" className="mt-4 w-full" disabled={busy}>
                {busy ? "جاري الدخول…" : "دخول"}
              </Button>
            </form>
          )}

          <Button href="/" variant="secondary" size="sm" className="mt-4 w-full">
            رجوع للمتجر
          </Button>
        </div>
      </Container>
    </div>
  );
}

/** Shared form bits for the admin pages. */
export const adminInput = "field";

export function AdminField({ label, children, className = "", hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-bold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-5 text-muted">{hint}</span>}
    </label>
  );
}

export function AdminCard({ title, children, actions, className }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn("card rounded-3xl p-5 sm:p-6", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-display text-lg font-bold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function AdminMessage({ message }: { message: { kind: "ok" | "warn" | "error"; text: string } | null }) {
  if (!message) return null;
  return (
    <div
      className={cn(
        "mb-6 rounded-2xl px-4 py-3 text-sm font-semibold",
        message.kind === "ok" ? "bg-success/10 text-success" : message.kind === "warn" ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"
      )}
    >
      {message.text}
    </div>
  );
}
