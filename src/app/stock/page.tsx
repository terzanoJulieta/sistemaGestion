"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase, mensajeError } from "@/lib/supabase";
import { fechaHora } from "@/lib/format";
import type { Producto } from "@/lib/types";
import { BuscadorProducto } from "@/components/BuscadorProducto";
import { Badge, Button, Card, ErrorMsg, Field, Input, PageHeader, Select, Table, td, th } from "@/components/ui";

type Movimiento = {
  id: number;
  fecha: string;
  tipo: string;
  cantidad: number;
  stock_resultante: number;
  motivo: string | null;
  venta_id: number | null;
  productos: { nombre: string } | null;
};

const TIPOS: Record<string, { label: string; color: "green" | "red" | "amber" | "slate" }> = {
  ingreso: { label: "Ingreso", color: "green" },
  inicial: { label: "Stock inicial", color: "slate" },
  ajuste: { label: "Ajuste", color: "amber" },
  venta: { label: "Venta", color: "red" },
  anulacion_venta: { label: "Anulación de venta", color: "green" },
  devolucion: { label: "Devolución", color: "green" },
};

export default function StockPage() {
  const [producto, setProducto] = useState<Producto | null>(null);
  const [tipo, setTipo] = useState<"ingreso" | "ajuste">("ingreso");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [bajos, setBajos] = useState<Producto[]>([]);
  const [guardando, setGuardando] = useState(false);

  const cargarMovs = useCallback(async () => {
    let q = supabase
      .from("movimientos_stock")
      .select("id, fecha, tipo, cantidad, stock_resultante, motivo, venta_id, productos(nombre)")
      .order("fecha", { ascending: false })
      .limit(100);
    if (producto) q = q.eq("producto_id", producto.id);
    const { data } = await q;
    setMovs((data as unknown as Movimiento[]) ?? []);
  }, [producto]);

  const cargarBajos = useCallback(async () => {
    const { data } = await supabase.from("productos").select("*").eq("activo", true).order("stock_actual").limit(300);
    setBajos(((data as Producto[]) ?? []).filter((p) => p.stock_actual <= p.stock_minimo));
  }, []);

  useEffect(() => {
    cargarMovs();
  }, [cargarMovs]);
  useEffect(() => {
    cargarBajos();
  }, [cargarBajos]);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!producto) return;
    setError(null);
    setOk(null);
    const n = Number(cantidad);
    if (!Number.isInteger(n)) return setError("Ingresá un número entero");
    // En "ajuste" se carga el stock contado; calculamos la diferencia.
    const delta = tipo === "ingreso" ? n : n - producto.stock_actual;
    if (delta === 0) return setError(tipo === "ajuste" ? "El stock contado es igual al actual, no hay nada que ajustar." : "La cantidad no puede ser cero");
    setGuardando(true);
    const { data, error } = await supabase.rpc("registrar_movimiento_stock", {
      p_producto_id: producto.id,
      p_tipo: tipo,
      p_cantidad: delta,
      p_motivo: motivo.trim() || null,
    });
    setGuardando(false);
    if (error) return setError(mensajeError(error));
    setOk(`${producto.nombre}: stock actualizado a ${data}.`);
    setProducto({ ...producto, stock_actual: data as number });
    setCantidad("");
    setMotivo("");
    cargarMovs();
    cargarBajos();
  }

  return (
    <div>
      <PageHeader title="Control de stock" />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="mb-2 font-semibold">Registrar ingreso o ajuste</h2>
          <BuscadorProducto
            onSelect={(p) => {
              setProducto(p);
              setOk(null);
              setError(null);
            }}
            onNoEncontrado={(c) => setError(`No existe un producto con el código ${c}. Dalo de alta en Productos.`)}
          />
          {producto && (
            <form onSubmit={registrar} className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded bg-slate-50 p-3 sm:col-span-2">
                <div className="font-medium">
                  {producto.nombre} {[producto.talle, producto.color].filter(Boolean).join(" · ")}
                </div>
                <div className="text-sm text-slate-600">
                  Código {producto.codigo_barras} · Stock actual: <b>{producto.stock_actual}</b> · Mínimo: {producto.stock_minimo}
                </div>
              </div>
              <Field label="Tipo">
                <Select value={tipo} onChange={(e) => setTipo(e.target.value as "ingreso" | "ajuste")}>
                  <option value="ingreso">Ingreso de mercadería (suma)</option>
                  <option value="ajuste">Ajuste por conteo (stock real)</option>
                </Select>
              </Field>
              <Field label={tipo === "ingreso" ? "Cantidad que ingresa" : "Stock real contado"}>
                <Input type="number" step="1" min={tipo === "ingreso" ? 1 : undefined} value={cantidad} onChange={(e) => setCantidad(e.target.value)} required autoFocus />
              </Field>
              <Field label="Motivo / proveedor (opcional)" className="sm:col-span-2">
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === "ingreso" ? "Ej: compra a proveedor X" : "Ej: rotura, conteo mensual"} />
              </Field>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="secondary" onClick={() => setProducto(null)}>
                  Ver todos los movimientos
                </Button>
                <Button type="submit" disabled={guardando}>
                  Registrar
                </Button>
              </div>
            </form>
          )}
          <div className="mt-3 space-y-2">
            <ErrorMsg msg={error} />
            {ok && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</div>}
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Stock bajo ({bajos.length})</h2>
          <ul className="max-h-80 divide-y overflow-y-auto text-sm">
            {bajos.map((p) => (
              <li key={p.id}>
                <button className="flex w-full justify-between py-1.5 text-left hover:bg-slate-50" onClick={() => setProducto(p)}>
                  <span>{p.nombre}</span>
                  <span className="text-red-700">
                    {p.stock_actual} / {p.stock_minimo}
                  </span>
                </button>
              </li>
            ))}
            {bajos.length === 0 && <li className="py-2 text-slate-500">Todo en orden.</li>}
          </ul>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 font-semibold">
        {producto ? `Movimientos de ${producto.nombre}` : "Últimos movimientos"}
      </h2>
      <Table>
        <thead>
          <tr>
            <th className={th}>Fecha</th>
            {!producto && <th className={th}>Producto</th>}
            <th className={th}>Tipo</th>
            <th className={`${th} text-right`}>Cantidad</th>
            <th className={`${th} text-right`}>Stock resultante</th>
            <th className={th}>Detalle</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {movs.map((m) => (
            <tr key={m.id}>
              <td className={td}>{fechaHora(m.fecha)}</td>
              {!producto && <td className={td}>{m.productos?.nombre}</td>}
              <td className={td}>
                <Badge color={TIPOS[m.tipo]?.color}>{TIPOS[m.tipo]?.label ?? m.tipo}</Badge>
              </td>
              <td className={`${td} text-right font-mono`}>{m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}</td>
              <td className={`${td} text-right`}>{m.stock_resultante}</td>
              <td className={td}>
                {m.venta_id ? (
                  <Link className="text-indigo-600 hover:underline" href={`/ventas/${m.venta_id}`}>
                    Venta N° {m.venta_id}
                  </Link>
                ) : (
                  m.motivo
                )}
              </td>
            </tr>
          ))}
          {movs.length === 0 && (
            <tr>
              <td colSpan={6} className={`${td} text-center text-slate-500`}>
                Sin movimientos.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
