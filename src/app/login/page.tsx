"use client";

import { useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { Button, Field, Input, ErrorMsg } from "@/components/ui";
import { comercio } from "@/lib/format";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Email o contraseña incorrectos" : mensajeError(error));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={ingresar} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">{comercio.nombre}</h1>
        <p className="text-sm text-slate-500">Ingresá con tu usuario</p>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Contraseña">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorMsg msg={error} />
        <Button type="submit" className="w-full" disabled={cargando}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
    </div>
  );
}
