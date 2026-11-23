"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pesos, inicioDelDia } from "@/lib/format";
import type { Producto } from "@/lib/types";
import { Card, PageHeader, Table, th, td, Button } from "@/components/ui";

export default function Inicio() {
  const [ventasHoy, setVentasHoy] = useState({ cantidad: 0, total: 0 });
  const [cobradoHoy, setCobradoHoy] = useState(0);
  const [fiadoTotal, setFiadoTotal] = useState(0);
  const [stockBajo, setStockBajo] = useState<Producto[]>([]);

  useEffect(() => {
    (async () => {
      const desde = inicioDelDia();
      const [v, p, c, s] = await Promise.all([
        supabase.from("ventas").select("total").eq("estado", "confirmada").gte("fecha", desde),
        supabase.from("pagos").select("monto").eq("anulado", false).gte("fecha", desde),
        supabase.from("clientes_saldo").select("saldo").gt("saldo", 0),
        supabase.from("productos").select("*").eq("activo", true).order("stock_actual").limit(200),
      ]);
      const vs = v.data ?? [];
      setVentasHoy({ cantidad: vs.length, total: vs.reduce((a, x) => a + Number(x.total), 0) });
      setCobradoHoy((p.data ?? []).reduce((a, x) => a + Number(x.monto), 0));
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
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-sm text-slate-500">Ventas de hoy</div>
          <div className="text-2xl font-semibold">{pesos(ventasHoy.total)}</div>
          <div className="text-xs text-slate-500">{ventasHoy.cantidad} comprobantes</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">Cobrado de cuentas corrientes hoy</div>
          <div className="text-2xl font-semibold">{pesos(cobradoHoy)}</div>
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
