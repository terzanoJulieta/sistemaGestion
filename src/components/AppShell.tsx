"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { comercio } from "@/lib/format";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/ventas/nueva", label: "Nueva venta" },
  { href: "/ventas", label: "Ventas" },
  { href: "/productos", label: "Productos" },
  { href: "/stock", label: "Stock" },
  { href: "/clientes", label: "Clientes" },
  { href: "/pagos", label: "Pagos" },
  { href: "/backup", label: "Backup" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const esLogin = pathname === "/login";

  useEffect(() => {
    if (session === null && !esLogin) router.replace("/login");
    if (session && esLogin) router.replace("/");
  }, [session, esLogin, router]);

  if (esLogin) return <>{children}</>;
  if (!session) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Cargando…</div>;
  }

  const activo = (href: string) =>
    href === "/" ? pathname === "/" : href === "/ventas" ? pathname === "/ventas" || /^\/ventas\/\d+/.test(pathname) : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white print:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/" className="font-semibold">
            {comercio.nombre}
          </Link>
          <button className="ml-auto md:hidden" onClick={() => setMenuAbierto(!menuAbierto)} aria-label="Menú">
            ☰
          </button>
          <nav className={`${menuAbierto ? "flex" : "hidden"} absolute left-0 right-0 top-12 z-40 flex-col bg-slate-900 p-2 md:static md:flex md:flex-row md:gap-1 md:p-0`}>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenuAbierto(false)}
                className={`rounded px-3 py-1.5 text-sm ${activo(n.href) ? "bg-indigo-600" : "hover:bg-slate-700"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <button
            className="hidden text-sm text-slate-300 hover:text-white md:ml-auto md:block"
            onClick={() => supabase.auth.signOut()}
            title={session.user.email ?? ""}
          >
            Salir
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4 print:p-0">{children}</main>
    </div>
  );
}
