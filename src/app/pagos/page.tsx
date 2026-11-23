"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { fechaHora, pesos } from "@/lib/format";
import { medioPagoLabel, type Cliente, type Pago } from "@/lib/types";
import { ClienteSelector } from "@/components/ClienteSelector";
import { PagoForm } from "@/components/PagoForm";
import { Badge, Button, ErrorMsg, Field, Input, Modal, PageHeader, Table, td, th } from "@/components/ui";

export default function PagosPage() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [desde, setDesde] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [filtroCliente, setFiltroCliente] = useState<Cliente | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    let q = supabase.from("pagos").select("*, clientes(nombre)").order("fecha", { ascending: false }).limit(1000);
    if (filtroCliente) q = q.eq("cliente_id", filtroCliente.id);
    if (desde) q = q.gte("fecha", new Date(`${desde}T00:00:00`).toISOString());
    if (hasta) q = q.lt("fecha", new Date(new Date(`${hasta}T00:00:00`).getTime() + 86400000).toISOString());
    const { data, error } = await q;
    if (error) setError(mensajeError(error));
    else setPagos(data as Pago[]);
  }, [desde, hasta, filtroCliente]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const total = pagos.filter((p) => !p.anulado).reduce((a, p) => a + Number(p.monto), 0);

  return (
    <div>
      <PageHeader
        title="Registro de pagos"
        actions={
          <Button
            onClick={() => {
              setCliente(null);
              setNuevo(true);
            }}
          >
            + Registrar pago
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Desde">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
        <Field label="Cliente">
          <div className="w-64">
            <ClienteSelector value={filtroCliente} onChange={setFiltroCliente} placeholder="Todos los clientes" />
          </div>
        </Field>
        <div className="ml-auto text-sm">
          Total cobrado: <b className="text-lg">{pesos(total)}</b>
        </div>
      </div>
      <ErrorMsg msg={error} />
      <Table>
        <thead>
          <tr>
            <th className={th}>Fecha</th>
            <th className={th}>Cliente</th>
            <th className={th}>Medio</th>
            <th className={th}>Observaciones</th>
            <th className={`${th} text-right`}>Monto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {pagos.map((p) => (
            <tr key={p.id} className={p.anulado ? "opacity-50" : ""}>
              <td className={td}>{fechaHora(p.fecha)}</td>
              <td className={td}>
                <Link href={`/clientes/${p.cliente_id}`} className="text-indigo-700 hover:underline">
                  {p.clientes?.nombre}
                </Link>
              </td>
              <td className={td}>{medioPagoLabel(p.medio_pago)}</td>
              <td className={td}>
                {p.observaciones} {p.anulado && <Badge color="red">Anulado</Badge>}
              </td>
              <td className={`${td} text-right font-medium`}>{pesos(p.monto)}</td>
            </tr>
          ))}
          {pagos.length === 0 && (
            <tr>
              <td colSpan={5} className={`${td} text-center text-slate-500`}>
                No hay pagos en el período.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Registrar pago">
        <div className="space-y-3">
          <Field label="Cliente">
            <ClienteSelector value={cliente} onChange={setCliente} />
          </Field>
          {cliente && (
            <PagoForm
              key={cliente.id}
              clienteId={cliente.id}
              saldo={Number(cliente.saldo ?? 0)}
              onCancelar={() => setNuevo(false)}
              onGuardado={() => {
                setNuevo(false);
                cargar();
              }}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
