"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, mensajeError } from "@/lib/supabase";
import { pesos } from "@/lib/format";
import { MEDIOS_PAGO, type Cliente, type MedioPago, type Producto } from "@/lib/types";
import { BuscadorProducto } from "@/components/BuscadorProducto";
import { ClienteSelector } from "@/components/ClienteSelector";
import { Badge, Button, Card, ErrorMsg, Field, Input, PageHeader, Select, Table, td, th } from "@/components/ui";

type Linea = { producto: Producto; cantidad: number; precio: number };

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.frequency.value = 220;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
  } catch {}
}

export default function NuevaVenta() {
  const router = useRouter();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [medio, setMedio] = useState<MedioPago>("efectivo");
  const [descTipo, setDescTipo] = useState<"$" | "%">("%");
  const [descValor, setDescValor] = useState("");
  const [pagaCon, setPagaCon] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Si viene desde la ficha del cliente: /ventas/nueva?cliente=ID
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("cliente");
    if (id)
      supabase
        .from("clientes_saldo")
        .select("*")
        .eq("id", Number(id))
        .single()
        .then(({ data }) => data && setCliente(data as Cliente));
  }, []);

  function agregar(p: Producto) {
    setError(null);
    if (!p.activo) {
      beep();
      return setError(`${p.nombre} está dado de baja.`);
    }
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.producto.id === p.id);
      if (i >= 0) {
        const copia = [...ls];
        copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 };
        return copia;
      }
      return [...ls, { producto: p, cantidad: 1, precio: Number(p.precio_venta) }];
    });
  }

  const subtotal = lineas.reduce((a, l) => a + l.cantidad * l.precio, 0);
  const dv = Number(descValor || 0);
  const descuento = Math.min(subtotal, Math.round((descTipo === "%" ? (subtotal * dv) / 100 : dv) * 100) / 100);
  const total = subtotal - descuento;
  const vuelto = medio === "efectivo" && pagaCon ? Number(pagaCon) - total : null;

  const confirmar = useCallback(async () => {
    if (guardando || lineas.length === 0) return;
    if (medio === "cuenta_corriente" && !cliente) return setError("Para vender fiado elegí un cliente.");
    setGuardando(true);
    setError(null);
    const { data, error } = await supabase.rpc("crear_venta", {
      p_items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad, precio_unitario: l.precio })),
      p_medio_pago: medio,
      p_cliente_id: cliente?.id ?? null,
      p_descuento: descuento,
      p_observaciones: obs.trim() || null,
    });
    if (error) {
      setGuardando(false);
      return setError(mensajeError(error));
    }
    router.push(`/ventas/${data}?imprimir=1`);
  }, [guardando, lineas, medio, cliente, descuento, obs, router]);

  // F2 confirma la venta
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        confirmar();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [confirmar]);

  return (
    <div>
      <PageHeader title="Nueva venta" />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <BuscadorProducto
            onSelect={agregar}
            onNoEncontrado={(c) => {
              beep();
              setError(`No se encontró el código ${c}.`);
            }}
          />
          <ErrorMsg msg={error} />
          <Table>
            <thead>
              <tr>
                <th className={th}>Producto</th>
                <th className={`${th} w-24`}>Cant.</th>
                <th className={`${th} w-32`}>Precio</th>
                <th className={`${th} text-right`}>Subtotal</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineas.map((l, i) => (
                <tr key={l.producto.id}>
                  <td className={td}>
                    <div>
                      {l.producto.nombre} {[l.producto.talle, l.producto.color].filter(Boolean).join(" · ")}
                    </div>
                    <div className="font-mono text-xs text-slate-400">{l.producto.codigo_barras}</div>
                    {l.cantidad > l.producto.stock_actual && (
                      <Badge color="amber">Stock disponible: {l.producto.stock_actual}</Badge>
                    )}
                  </td>
                  <td className={td}>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      className="w-20"
                      value={l.cantidad}
                      onChange={(e) => {
                        const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                        setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidad: n } : x)));
                      }}
                    />
                  </td>
                  <td className={td}>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-28"
                      value={l.precio}
                      onChange={(e) => {
                        const n = Math.max(0, Number(e.target.value) || 0);
                        setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, precio: n } : x)));
                      }}
                    />
                  </td>
                  <td className={`${td} text-right font-medium`}>{pesos(l.cantidad * l.precio)}</td>
                  <td className={`${td} text-right`}>
                    <button className="text-red-500 hover:text-red-700" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} aria-label="Quitar">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {lineas.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${td} py-10 text-center text-slate-400`}>
                    Escaneá productos con la lectora para agregarlos.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>

        <Card className="h-fit space-y-3">
          <Field label="Cliente">
            <ClienteSelector value={cliente} onChange={setCliente} />
          </Field>
          <Field label="Medio de pago">
            <Select value={medio} onChange={(e) => setMedio(e.target.value as MedioPago)}>
              {MEDIOS_PAGO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          {medio === "cuenta_corriente" && cliente?.limite_credito != null && (
            <p className="text-xs text-slate-600">
              Límite {pesos(cliente.limite_credito)} · disponible {pesos(Number(cliente.limite_credito) - Number(cliente.saldo ?? 0))}
            </p>
          )}
          <Field label="Descuento">
            <div className="flex gap-2">
              <Select value={descTipo} onChange={(e) => setDescTipo(e.target.value as "$" | "%")} className="w-20">
                <option value="%">%</option>
                <option value="$">$</option>
              </Select>
              <Input type="number" min="0" step="0.01" className="flex-1" value={descValor} onChange={(e) => setDescValor(e.target.value)} placeholder="0" />
            </div>
          </Field>
          <Field label="Observaciones">
            <Input value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>

          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{pesos(subtotal)}</span>
            </div>
            {descuento > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Descuento</span>
                <span>-{pesos(descuento)}</span>
              </div>
            )}
            <div className="flex justify-between text-2xl font-bold">
              <span>Total</span>
              <span>{pesos(total)}</span>
            </div>
          </div>

          {medio === "efectivo" && (
            <Field label="Paga con">
              <Input type="number" min="0" step="0.01" value={pagaCon} onChange={(e) => setPagaCon(e.target.value)} />
              {vuelto !== null && (
                <span className={`text-sm ${vuelto < 0 ? "text-red-600" : "text-slate-700"}`}>
                  {vuelto < 0 ? `Faltan ${pesos(-vuelto)}` : `Vuelto: ${pesos(vuelto)}`}
                </span>
              )}
            </Field>
          )}

          <Button className="w-full py-3 text-base" onClick={confirmar} disabled={guardando || lineas.length === 0}>
            {guardando ? "Registrando…" : "Confirmar venta (F2)"}
          </Button>
          {lineas.length > 0 && (
            <Button variant="ghost" className="w-full" onClick={() => confirm("¿Vaciar la venta?") && setLineas([])}>
              Cancelar venta
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
