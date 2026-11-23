"use client";

import { useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { pesos } from "@/lib/format";
import { Button, ErrorMsg, Field, Input, Select } from "@/components/ui";

const MEDIOS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
];

export function PagoForm({
  clienteId,
  saldo,
  onGuardado,
  onCancelar,
}: {
  clienteId: number;
  saldo: number;
  onGuardado: (pagoId: number) => void;
  onCancelar?: () => void;
}) {
  const [monto, setMonto] = useState(saldo > 0 ? String(saldo) : "");
  const [medio, setMedio] = useState("efectivo");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(monto);
    if (!(n > 0)) return setError("El monto tiene que ser mayor a cero");
    setGuardando(true);
    setError(null);
    const { data, error } = await supabase
      .from("pagos")
      .insert({ cliente_id: clienteId, monto: n, medio_pago: medio, observaciones: obs.trim() || null })
      .select()
      .single();
    setGuardando(false);
    if (error) return setError(mensajeError(error));
    onGuardado(data.id);
  }

  const n = Number(monto || 0);
  return (
    <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
      <div className="text-sm text-slate-600 sm:col-span-2">
        Saldo actual: <b>{pesos(saldo)}</b>
        {n > 0 && <> · Después del pago: <b>{pesos(saldo - n)}</b></>}
      </div>
      <Field label="Monto *">
        <Input type="number" min="0.01" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required autoFocus />
      </Field>
      <Field label="Medio de pago">
        <Select value={medio} onChange={(e) => setMedio(e.target.value)}>
          {MEDIOS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Observaciones" className="sm:col-span-2">
        <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
      </Field>
      <div className="sm:col-span-2">
        <ErrorMsg msg={error} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancelar && (
          <Button type="button" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={guardando}>
          Registrar pago
        </Button>
      </div>
    </form>
  );
}
