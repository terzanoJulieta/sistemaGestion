"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pesos, inicioDelDia } from "@/lib/format";
import type { Producto } from "@/lib/types";
import { ultimoBackup } from "@/lib/backup";

const MEDIOS_CAJA = [
  { value: "efectivo", label: "Efectivo" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferencia" },
];
type FilaCaja = { medio: string; label: string; ventas: number; cobros: number; devoluciones: number; total: number };
import { Card, PageHeader, Table, th, td, Button } from "@/components/ui";

export default function Inicio() {
  const [ventasHoy, setVentasHoy] = useState({ cantidad: 0, total: 0 });
  const [cobradoHoy, setCobradoHoy] = useState(0);
  const [fiadoHoy, setFiadoHoy] = useState(0);
  const [caja, setCaja] = useState<FilaCaja[]>([]);
  const [fiadoTotal, setFiadoTotal] = useState(0);
  const [stockBajo, setStockBajo] = useState<Producto[]>([]);
  const [avisoBackup, setAvisoBackup] = useState<string | null>(null);

  useEffect(() => {
    const u = ultimoBackup();
    const dias = u ? Math.floor((Date.now() - u.getTime()) / 86400000) : null;
    if (dias === null) setAvisoBackup("Todavía no descargaste ningún backup de los datos.");
    else if (dias >= 7) setAvisoBackup(`Hace ${dias} días que no descargás un backup de los datos.`);
  }, []);

  useEffect(() => {
    (async () => {
      const desde = inicioDelDia();
      const [v, p, c, s, d] = await Promise.all([
        supabase.from("ventas").select("total, total_devuelto, medio_pago").eq("estado", "confirmada").gte("fecha", desde),
        supabase.from("pagos").select("monto, medio_pago").eq("anulado", false).gte("fecha", desde),
        supabase.from("clientes_saldo").select("saldo").gt("saldo", 0),
        supabase.from("productos").select("*").eq("activo", true).order("stock_actual").limit(200),
        supabase.from("devoluciones").select("monto, ventas!inner(medio_pago, estado)").gte("fecha", desde),
      ]);
      const vs = v.data ?? [];
      const ps = p.data ?? [];
      const ds = ((d.data ?? []) as unknown as { monto: number; ventas: { medio_pago: string; estado: string } }[]).filter(
        (x) => x.ventas.estado === "confirmada",
      );
      setVentasHoy({ cantidad: vs.length, total: vs.reduce((a, x) => a + Number(x.total) - Number(x.total_devuelto), 0) });
      setFiadoHoy(
        vs.filter((x) => x.medio_pago === "cuenta_corriente").reduce((a, x) => a + Number(x.total) - Number(x.total_devuelto), 0),
      );
      const filas = MEDIOS_CAJA.map((m) => {
        const ventas = vs.filter((x) => x.medio_pago === m.value).reduce((a, x) => a + Number(x.total), 0);
        const cobros = ps.filter((x) => x.medio_pago === m.value).reduce((a, x) => a + Number(x.monto), 0);
        const devoluciones = ds.filter((x) => x.ventas.medio_pago === m.value).reduce((a, x) => a + Number(x.monto), 0);
        return { medio: m.value, label: m.label, ventas, cobros, devoluciones, total: ventas + cobros - devoluciones };
      });
      setCaja(filas);
      setCobradoHoy(filas.reduce((a, f) => a + f.total, 0));
      setFiadoTotal((c.data ?? []).reduce((a, x) => a + Number(x.saldo), 0));
      setStockBajo(((s.data ?? []) as Producto[]).filter((x) => x.stock_actual <= x.stock_minimo).slice(0, 15));
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="Inicio"
        actions={
          <Link href="/ventas/nueva">
            <Button>+ Nueva venta</Button>
          </Link>
        }
      />
      {avisoBackup && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>{avisoBackup}</span>
          <Link href="/backup" className="font-medium text-amber-900 underline">
            Hacer backup ahora
          </Link>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <div className="text-sm text-slate-500">Ventas de hoy</div>
          <div className="text-2xl font-semibold">{pesos(ventasHoy.total)}</div>
          <div className="text-xs text-slate-500">{ventasHoy.cantidad} comprobantes</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Cobrado hoy (caja)</div>
          <div className="text-2xl font-semibold text-green-700">{pesos(cobradoHoy)}</div>
          <div className="text-xs text-slate-500">Ventas pagadas + cobros de fiado − devoluciones</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Fiado hoy</div>
          <div className="text-2xl font-semibold text-amber-700">{pesos(fiadoHoy)}</div>
          <div className="text-xs text-slate-500">Vendido hoy a cuenta corriente</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Total fiado pendiente</div>
          <div className="text-2xl font-semibold text-amber-700">{pesos(fiadoTotal)}</div>
          <Link href="/clientes" className="text-xs text-indigo-600 hover:underline">
            Ver clientes
          </Link>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Productos con stock bajo</div>
          <div className="text-2xl font-semibold text-red-700">{stockBajo.length}</div>
          <Link href="/stock" className="text-xs text-indigo-600 hover:underline">
            Ir a stock
          </Link>
        </Card>
      </div>

      <h2 className="mb-2 font-semibold">Caja de hoy</h2>
      <div className="mb-6">
        <Table>
          <thead>
            <tr>
              <th className={th}>Medio de pago</th>
              <th className={`${th} text-right`}>Ventas</th>
              <th className={`${th} text-right`}>Cobros de fiado</th>
              <th className={`${th} text-right`}>Devoluciones</th>
              <th className={`${th} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {caja.map((f) => (
              <tr key={f.medio}>
                <td className={td}>{f.label}</td>
                <td className={`${td} text-right`}>{pesos(f.ventas)}</td>
                <td className={`${td} text-right`}>{pesos(f.cobros)}</td>
                <td className={`${td} text-right text-red-700`}>{f.devoluciones ? `-${pesos(f.devoluciones)}` : pesos(0)}</td>
                <td className={`${td} text-right font-semibold`}>{pesos(f.total)}</td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className={`${td} font-semibold`}>Total</td>
              <td className={`${td} text-right font-semibold`}>{pesos(caja.reduce((a, f) => a + f.ventas, 0))}</td>
              <td className={`${td} text-right font-semibold`}>{pesos(caja.reduce((a, f) => a + f.cobros, 0))}</td>
              <td className={`${td} text-right font-semibold text-red-700`}>-{pesos(caja.reduce((a, f) => a + f.devoluciones, 0))}</td>
              <td className={`${td} text-right text-lg font-bold`}>{pesos(cobradoHoy)}</td>
            </tr>
          </tbody>
        </Table>
      </div>

      {stockBajo.length > 0 && (
        <>
          <h2 className="mb-2 font-semibold">Para reponer</h2>
          <Table>
            <thead>
              <tr>
                <th className={th}>Producto</th>
                <th className={th}>Stock</th>
                <th className={th}>Mínimo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockBajo.map((p) => (
                <tr key={p.id}>
                  <td className={td}>{p.nombre}</td>
                  <td className={`${td} font-semibold text-red-700`}>{p.stock_actual}</td>
                  <td className={td}>{p.stock_minimo}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
