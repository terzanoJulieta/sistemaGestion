"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { fechaHora, pesos } from "@/lib/format";
import type { Cliente } from "@/lib/types";
import { ClienteForm } from "@/components/ClienteForm";
import { PagoForm } from "@/components/PagoForm";
import { Button, Card, ErrorMsg, Modal, PageHeader, Table, td, th } from "@/components/ui";

type Mov = {
  fecha: string;
  tipo: "venta" | "pago";
  venta_id: number | null;
  pago_id: number | null;
  concepto: string;
  debe: number;
  haber: number;
};

export default function ClienteDetalle() {
  const { id } = useParams<{ id: string }>();
  const clienteId = Number(id);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [modal, setModal] = useState<"pago" | "editar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [c, m] = await Promise.all([
      supabase.from("clientes_saldo").select("*").eq("id", clienteId).single(),
      supabase.from("cuenta_corriente_movimientos").select("*").eq("cliente_id", clienteId).order("fecha"),
    ]);
    if (c.error) setError(mensajeError(c.error));
    setCliente(c.data as Cliente);
    setMovs((m.data as Mov[]) ?? []);
  }, [clienteId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function anularPago(pagoId: number) {
    if (!confirm("¿Anular este pago? El saldo del cliente vuelve a subir.")) return;
    const { error } = await supabase.from("pagos").update({ anulado: true }).eq("id", pagoId);
    if (error) setError(mensajeError(error));
    cargar();
  }

  if (!cliente) return <div className="text-slate-500">{error ?? "Cargando…"}</div>;

  const filas = movs.reduce<(Mov & { saldo: number })[]>((acc, m) => {
    const anterior = acc.length ? acc[acc.length - 1].saldo : 0;
    acc.push({ ...m, saldo: anterior + Number(m.debe) - Number(m.haber) });
    return acc;
  }, []);
  const saldo = Number(cliente.saldo ?? 0);

  return (
    <div>
      <div className="mb-2 text-sm">
        <Link href="/clientes" className="text-indigo-600 hover:underline">
          ← Clientes
        </Link>
      </div>
      <PageHeader
        title={cliente.nombre}
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal("editar")}>
              Editar datos
            </Button>
            <Link href={`/ventas?cliente=${cliente.id}`}>
              <Button variant="secondary">Todas sus compras</Button>
            </Link>
            <Link href={`/ventas/nueva?cliente=${cliente.id}`}>
              <Button variant="secondary">Nueva venta</Button>
            </Link>
            <Button onClick={() => setModal("pago")}>Registrar pago</Button>
          </>
        }
      />
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-sm text-slate-500">Saldo de cuenta corriente</div>
          <div className={`text-3xl font-semibold ${saldo > 0 ? "text-amber-700" : saldo < 0 ? "text-green-700" : ""}`}>{pesos(saldo)}</div>
          <div className="text-xs text-slate-500">{saldo > 0 ? "Debe" : saldo < 0 ? "Saldo a favor" : "Al día"}</div>
        </Card>
        <Card className="md:col-span-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>DNI/CUIT: {cliente.documento ?? "-"}</div>
            <div>Teléfono: {cliente.telefono ?? "-"}</div>
            <div>Email: {cliente.email ?? "-"}</div>
            <div>Dirección: {cliente.direccion ?? "-"}</div>
            <div>Límite de fiado: {cliente.limite_credito != null ? pesos(cliente.limite_credito) : "Sin límite"}</div>
            <div>{cliente.observaciones}</div>
          </div>
        </Card>
      </div>
      <ErrorMsg msg={error} />
      {aviso && <div className="mb-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{aviso}</div>}

      <h2 className="mb-2 font-semibold">Movimientos</h2>
      <Table>
        <thead>
          <tr>
            <th className={th}>Fecha</th>
            <th className={th}>Concepto</th>
            <th className={`${th} text-right`}>Debe</th>
            <th className={`${th} text-right`}>Haber</th>
            <th className={`${th} text-right`}>Saldo</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas
            .slice()
            .reverse()
            .map((m) => (
              <tr key={`${m.tipo}-${m.venta_id ?? m.pago_id}`}>
                <td className={td}>{fechaHora(m.fecha)}</td>
                <td className={td}>
                  {m.venta_id ? (
                    <Link className="text-indigo-600 hover:underline" href={`/ventas/${m.venta_id}`}>
                      {m.concepto}
                    </Link>
                  ) : (
                    m.concepto
                  )}
                </td>
                <td className={`${td} text-right`}>{Number(m.debe) ? pesos(m.debe) : ""}</td>
                <td className={`${td} text-right text-green-700`}>{Number(m.haber) ? pesos(m.haber) : ""}</td>
                <td className={`${td} text-right font-medium`}>{pesos(m.saldo)}</td>
                <td className={`${td} text-right`}>
                  {m.pago_id && (
                    <Button variant="ghost" className="text-red-600" onClick={() => anularPago(m.pago_id!)}>
                      Anular
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={6} className={`${td} text-center text-slate-500`}>
                Sin movimientos en cuenta corriente.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Modal open={modal === "pago"} onClose={() => setModal(null)} title={`Registrar pago de ${cliente.nombre}`}>
        {modal === "pago" && (
          <PagoForm
            clienteId={cliente.id}
            saldo={saldo}
            onCancelar={() => setModal(null)}
            onGuardado={() => {
              setModal(null);
              setAviso("Pago registrado.");
              cargar();
            }}
          />
        )}
      </Modal>
      <Modal open={modal === "editar"} onClose={() => setModal(null)} title="Editar cliente" wide>
        {modal === "editar" && (
          <ClienteForm
            cliente={cliente}
            onCancelar={() => setModal(null)}
            onGuardado={() => {
              setModal(null);
              cargar();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
