"use client";

import { useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import type { Cliente } from "@/lib/types";
import { Button, ErrorMsg, Field, Input } from "@/components/ui";

export function ClienteForm({
  cliente,
  onGuardado,
  onCancelar,
}: {
  cliente?: Cliente | null;
  onGuardado: (c: Cliente) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState({
    nombre: cliente?.nombre ?? "",
    documento: cliente?.documento ?? "",
    telefono: cliente?.telefono ?? "",
    email: cliente?.email ?? "",
    direccion: cliente?.direccion ?? "",
    limite_credito: cliente?.limite_credito != null ? String(cliente.limite_credito) : "",
    observaciones: cliente?.observaciones ?? "",
    activo: cliente?.activo ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const datos = {
      nombre: f.nombre.trim(),
      documento: f.documento.trim() || null,
      telefono: f.telefono.trim() || null,
      email: f.email.trim() || null,
      direccion: f.direccion.trim() || null,
      limite_credito: f.limite_credito === "" ? null : Number(f.limite_credito),
      observaciones: f.observaciones.trim() || null,
      activo: f.activo,
    };
    const res = cliente?.id
      ? await supabase.from("clientes").update(datos).eq("id", cliente.id).select().single()
      : await supabase.from("clientes").insert(datos).select().single();
    setGuardando(false);
    if (res.error) return setError(mensajeError(res.error));
    onGuardado(res.data as Cliente);
  }

  return (
    <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
      <Field label="Nombre y apellido *" className="sm:col-span-2">
        <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required autoFocus />
      </Field>
      <Field label="DNI / CUIT">
        <Input value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} />
      </Field>
      <Field label="Teléfono">
        <Input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
      </Field>
      <Field label="Email">
        <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      <Field label="Dirección">
        <Input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
      </Field>
      <Field label="Límite de fiado (vacío = sin límite)">
        <Input type="number" min="0" step="0.01" value={f.limite_credito} onChange={(e) => setF({ ...f, limite_credito: e.target.value })} />
      </Field>
      <Field label="Observaciones">
        <Input value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} />
      </Field>
      {cliente?.id && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
          Activo
        </label>
      )}
      <div className="sm:col-span-2">
        <ErrorMsg msg={error} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardando}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
