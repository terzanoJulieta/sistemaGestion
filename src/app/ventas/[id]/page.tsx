"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { comercio, fechaHora, pesos } from "@/lib/format";
import { medioPagoLabel, type Venta, type VentaItem } from "@/lib/types";
import { Badge, Button, ErrorMsg } from "@/components/ui";

type VentaCompleta = Venta & {
  clientes: { nombre: string; documento: string | null; direccion: string | null } | null;
  venta_items: VentaItem[];
};

export default function Comprobante() {
  const { id } = useParams<{ id: string }>();
  const [venta, setVenta] = useState<VentaCompleta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("ventas")
      .select("*, clientes(nombre, documento, direccion), venta_items(*)")
      .eq("id", Number(id))
      .single();
    if (error) setError(mensajeError(error));
    else setVenta(data as VentaCompleta);
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

  if (!venta) return <div className="text-slate-500">{error ?? "Cargando…"}</div>;

  const numero = String(venta.id).padStart(8, "0");

  return (
    <div>
      <style>{`@media print { @page { size: 80mm auto; margin: 3mm; } }`}</style>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/ventas" className="text-sm text-indigo-600 hover:underline">
          ← Ventas
        </Link>
        <div className="ml-auto flex gap-2">
          {venta.estado === "confirmada" && (
            <Button variant="danger" onClick={anular}>
              Anular venta
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
        <div>Pago: {medioPagoLabel(venta.medio_pago)}</div>
        {venta.observaciones && <div>Obs: {venta.observaciones}</div>}
        <div className="my-1 border-t border-dashed border-black" />
        <div className="text-center">¡Gracias por su compra!</div>
      </div>

      {venta.estado === "anulada" && (
        <div className="mt-3 text-center print:hidden">
          <Badge color="red">Venta anulada</Badge>
        </div>
      )}
    </div>
  );
}
