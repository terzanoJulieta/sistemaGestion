"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { comercio, fechaHora, pesos } from "@/lib/format";
import { medioPagoLabel, type Venta, type VentaItem } from "@/lib/types";
import { Badge, Button, ErrorMsg, Field, Input, Modal } from "@/components/ui";

type VentaCompleta = Venta & {
  clientes: { nombre: string; documento: string | null; direccion: string | null } | null;
  venta_items: VentaItem[];
  devoluciones: { id: number; fecha: string; monto: number; motivo: string | null }[];
};

export default function Comprobante() {
  const { id } = useParams<{ id: string }>();
  const [venta, setVenta] = useState<VentaCompleta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devolviendo, setDevolviendo] = useState(false);
  const [cantDev, setCantDev] = useState<Record<number, string>>({});
  const [motivo, setMotivo] = useState("");
  const [errorDev, setErrorDev] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("ventas")
      .select("*, clientes(nombre, documento, direccion), venta_items(*), devoluciones(id, fecha, monto, motivo)")
      .eq("id", Number(id))
      .single();
    if (error) setError(mensajeError(error));
    else {
      const v = data as VentaCompleta;
      v.venta_items.sort((a, b) => a.id - b.id);
      v.devoluciones.sort((a, b) => a.id - b.id);
      setVenta(v);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Recién creada: abre el diálogo de impresión automáticamente
  useEffect(() => {
    if (!venta) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("imprimir") === "1") {
      window.history.replaceState(null, "", `/ventas/${venta.id}`);
      setTimeout(() => window.print(), 300);
    }
  }, [venta]);

  async function anular() {
    if (!venta) return;
    if (!confirm(`¿Anular la venta N° ${venta.id}? Se devuelve el stock${venta.medio_pago === "cuenta_corriente" ? " y se descuenta de la cuenta corriente del cliente" : ""}.`)) return;
    const { error } = await supabase.rpc("anular_venta", { p_venta_id: venta.id });
    if (error) setError(mensajeError(error));
    cargar();
  }

  async function devolver() {
    if (!venta) return;
    const items = venta.venta_items
      .map((it) => ({ venta_item_id: it.id, cantidad: Math.floor(Number(cantDev[it.id] || 0)) }))
      .filter((x) => x.cantidad > 0);
    if (items.length === 0) return setErrorDev("Indicá cuántas unidades devuelve de cada producto.");
    setErrorDev(null);
    const { error } = await supabase.rpc("devolver_items", {
      p_venta_id: venta.id,
      p_items: items,
      p_motivo: motivo.trim() || null,
    });
    if (error) return setErrorDev(mensajeError(error));
    setDevolviendo(false);
    setCantDev({});
    setMotivo("");
    cargar();
  }

  if (!venta) return <div className="text-slate-500">{error ?? "Cargando…"}</div>;

  const pendientes = venta.venta_items.filter((it) => it.cantidad > it.cantidad_devuelta);
  const factor = Number(venta.subtotal) > 0 ? Number(venta.total) / Number(venta.subtotal) : 1;
  const montoDev = venta.venta_items.reduce(
    (a, it) => a + Math.round(Number(it.precio_unitario) * Math.floor(Number(cantDev[it.id] || 0)) * factor * 100) / 100,
    0,
  );
  const devuelto = Number(venta.total_devuelto ?? 0);

  const numero = String(venta.id).padStart(8, "0");

  return (
    <div>
      <style>{`@media print { @page { size: 80mm auto; margin: 3mm; } }`}</style>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/ventas" className="text-sm text-indigo-600 hover:underline">
          ← Ventas
        </Link>
        <div className="ml-auto flex gap-2">
          {venta.estado === "confirmada" && pendientes.length > 0 && (
            <Button variant="secondary" onClick={() => setDevolviendo(true)}>
              Devolver productos
            </Button>
          )}
          {venta.estado === "confirmada" && (
            <Button variant="danger" onClick={anular}>
              Anular venta completa
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimir
          </Button>
          <Link href="/ventas/nueva">
            <Button>Nueva venta</Button>
          </Link>
        </div>
      </div>
      <div className="print:hidden">
        <ErrorMsg msg={error} />
      </div>

      <div className="mx-auto w-[76mm] bg-white p-3 font-mono text-[12px] leading-tight text-black shadow print:w-full print:p-0 print:shadow-none">
        <div className="text-center">
          <div className="text-[15px] font-bold">{comercio.nombre}</div>
          {comercio.direccion && <div>{comercio.direccion}</div>}
          {comercio.telefono && <div>Tel: {comercio.telefono}</div>}
          {comercio.cuit && <div>CUIT: {comercio.cuit}</div>}
          <div className="my-1 border-t border-dashed border-black" />
          <div className="font-bold">COMPROBANTE DE VENTA</div>
          <div>No válido como factura</div>
          <div>N° {numero}</div>
          <div>{fechaHora(venta.fecha)}</div>
          {venta.estado === "anulada" && <div className="mt-1 text-[14px] font-bold">*** ANULADA ***</div>}
        </div>
        <div className="my-1 border-t border-dashed border-black" />
        <div>Cliente: {venta.clientes?.nombre ?? "Consumidor final"}</div>
        {venta.clientes?.documento && <div>DNI/CUIT: {venta.clientes.documento}</div>}
        <div className="my-1 border-t border-dashed border-black" />
        {venta.venta_items.map((it) => (
          <div key={it.id} className="mb-1">
            <div>{it.descripcion}</div>
            <div className="flex justify-between">
              <span>
                {it.cantidad} x {pesos(it.precio_unitario)}
              </span>
              <span>{pesos(it.subtotal)}</span>
            </div>
            {it.cantidad_devuelta > 0 && <div>  (devuelto: {it.cantidad_devuelta})</div>}
          </div>
        ))}
        <div className="my-1 border-t border-dashed border-black" />
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{pesos(venta.subtotal)}</span>
        </div>
        {Number(venta.descuento) > 0 && (
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>-{pesos(venta.descuento)}</span>
          </div>
        )}
        <div className="flex justify-between text-[15px] font-bold">
          <span>TOTAL</span>
          <span>{pesos(venta.total)}</span>
        </div>
        {devuelto > 0 && (
          <>
            {venta.devoluciones.map((d) => (
              <div key={d.id} className="flex justify-between">
                <span>Devolución {fechaHora(d.fecha)}</span>
                <span>-{pesos(d.monto)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold">
              <span>TOTAL NETO</span>
              <span>{pesos(Number(venta.total) - devuelto)}</span>
            </div>
          </>
        )}
        <div>Pago: {medioPagoLabel(venta.medio_pago)}</div>
        {venta.observaciones && <div>Obs: {venta.observaciones}</div>}
        <div className="my-1 border-t border-dashed border-black" />
        <div className="text-center">¡Gracias por su compra!</div>
      </div>

      <Modal open={devolviendo} onClose={() => setDevolviendo(false)} title={`Devolver productos de la venta N° ${venta.id}`} wide>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Indicá cuántas unidades devuelve de cada producto. El stock vuelve a sumarse
            {venta.medio_pago === "cuenta_corriente" ? " y el importe se descuenta de la cuenta corriente del cliente." : "."}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1">Producto</th>
                <th className="py-1">Vendidas</th>
                <th className="py-1">Ya devueltas</th>
                <th className="py-1 w-28">Devuelve</th>
              </tr>
            </thead>
            <tbody>
              {venta.venta_items.map((it) => {
                const max = it.cantidad - it.cantidad_devuelta;
                return (
                  <tr key={it.id} className="border-t">
                    <td className="py-1.5">{it.descripcion}</td>
                    <td>{it.cantidad}</td>
                    <td>{it.cantidad_devuelta}</td>
                    <td>
                      <Input
                        type="number"
                        min="0"
                        max={max}
                        step="1"
                        className="w-24"
                        disabled={max === 0}
                        value={cantDev[it.id] ?? ""}
                        placeholder="0"
                        onChange={(e) => {
                          const n = Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0)));
                          setCantDev({ ...cantDev, [it.id]: e.target.value === "" ? "" : String(n) });
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Field label="Motivo (opcional)">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: cambio de talle" />
          </Field>
          <div className="text-right text-sm">
            Importe a devolver{Number(venta.descuento) > 0 ? " (con el descuento aplicado)" : ""}: <b className="text-lg">{pesos(montoDev)}</b>
          </div>
          <ErrorMsg msg={errorDev} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDevolviendo(false)}>
              Cancelar
            </Button>
            <Button onClick={devolver} disabled={montoDev <= 0 && Object.values(cantDev).every((v) => !Number(v))}>
              Confirmar devolución
            </Button>
          </div>
        </div>
      </Modal>

      {venta.estado === "anulada" && (
        <div className="mt-3 text-center print:hidden">
          <Badge color="red">Venta anulada</Badge>
        </div>
      )}
    </div>
  );
}
