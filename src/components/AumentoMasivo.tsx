"use client";

import { useEffect, useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { pesos } from "@/lib/format";
import type { Categoria, Producto } from "@/lib/types";
import { Button, ErrorMsg, Field, Input, Select } from "@/components/ui";

type Aplicar = "lista_y_venta" | "solo_venta";

function nuevoPrecio(p: Producto, pct: number, aplicar: Aplicar, redondeo: number) {
  const f = 1 + pct / 100;
  const costo = aplicar === "lista_y_venta" ? Number(p.precio_costo) * f : Number(p.precio_costo);
  let venta =
    aplicar === "lista_y_venta" && p.margen_ganancia != null && Number(p.precio_costo) > 0
      ? costo * (1 + Number(p.margen_ganancia) / 100)
      : Number(p.precio_venta) * f;
  venta = Math.round(venta * 100) / 100;
  if (redondeo > 0) venta = Math.ceil(venta / redondeo) * redondeo;
  return { costo, venta };
}

export function AumentoMasivo({
  categorias,
  onAplicado,
  onCancelar,
}: {
  categorias: Categoria[];
  onAplicado: (n: number) => void;
  onCancelar: () => void;
}) {
  const [pct, setPct] = useState("");
  const [cat, setCat] = useState("");
  const [aplicar, setAplicar] = useState<Aplicar>("lista_y_venta");
  const [redondeo, setRedondeo] = useState("0");
  const [afectados, setAfectados] = useState<Producto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    let q = supabase.from("productos").select("*").eq("activo", true).order("nombre").limit(5000);
    if (cat) q = q.eq("categoria_id", Number(cat));
    q.then(({ data }) => setAfectados((data as Producto[]) ?? []));
  }, [cat]);

  const n = Number(pct);
  const valido = pct !== "" && n !== 0 && n > -100;

  async function aplicarAumento() {
    if (!valido) return setError("Ingresá un porcentaje, por ejemplo 2 (o -5 para bajar precios).");
    const nombreCat = cat ? categorias.find((c) => String(c.id) === cat)?.nombre : "todas las categorías";
    if (!confirm(`¿Aplicar ${n > 0 ? "un aumento" : "una baja"} del ${Math.abs(n)}% a ${afectados.length} productos (${nombreCat})? Esto no se puede deshacer automáticamente.`)) return;
    setAplicando(true);
    setError(null);
    const { data, error } = await supabase.rpc("aumentar_precios", {
      p_porcentaje: n,
      p_aplicar_a: aplicar,
      p_categoria_id: cat ? Number(cat) : null,
      p_redondeo: Number(redondeo),
    });
    setAplicando(false);
    if (error) return setError(mensajeError(error));
    onAplicado(data as number);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Porcentaje (%)">
        <Input type="number" step="0.01" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Ej: 2" autoFocus />
      </Field>
      <Field label="Categoría">
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Qué precio aumentar">
        <Select value={aplicar} onChange={(e) => setAplicar(e.target.value as Aplicar)}>
          <option value="lista_y_venta">Precio de lista y de venta (mantiene el % de ganancia)</option>
          <option value="solo_venta">Solo el precio de venta</option>
        </Select>
      </Field>
      <Field label="Redondear precio de venta hacia arriba">
        <Select value={redondeo} onChange={(e) => setRedondeo(e.target.value)}>
          <option value="0">Sin redondeo</option>
          <option value="1">A $1</option>
          <option value="10">A $10</option>
          <option value="50">A $50</option>
          <option value="100">A $100</option>
        </Select>
      </Field>

      <div className="sm:col-span-2">
        <div className="mb-1 text-sm text-slate-600">
          Se van a actualizar <b>{afectados.length}</b> productos activos.{valido && " Vista previa:"}
        </div>
        {valido && (
          <div className="max-h-56 overflow-y-auto rounded border text-sm">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-1">Producto</th>
                  <th className="px-2 py-1 text-right">Venta actual</th>
                  <th className="px-2 py-1 text-right">Venta nueva</th>
                </tr>
              </thead>
              <tbody>
                {afectados.slice(0, 50).map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-2 py-1">{p.nombre}</td>
                    <td className="px-2 py-1 text-right">{pesos(p.precio_venta)}</td>
                    <td className="px-2 py-1 text-right font-medium">{pesos(nuevoPrecio(p, n, aplicar, Number(redondeo)).venta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="sm:col-span-2">
        <ErrorMsg msg={error} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button onClick={aplicarAumento} disabled={aplicando || !valido || afectados.length === 0}>
          {aplicando ? "Aplicando…" : "Aplicar aumento"}
        </Button>
      </div>
    </div>
  );
}
