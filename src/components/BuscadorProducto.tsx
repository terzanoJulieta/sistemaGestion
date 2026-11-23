"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pesos, limpiarBusqueda } from "@/lib/format";
import type { Producto } from "@/lib/types";

/**
 * Un solo campo para la lectora de código de barras y para buscar por nombre.
 * - Lectora: escribe el código + Enter → se busca por código exacto.
 * - Escribiendo un nombre aparece una lista; con ↑ ↓ y Enter (o clic) se elige.
 */
export function BuscadorProducto({
  onSelect,
  onNoEncontrado,
  autoFocus = true,
  placeholder = "Escaneá el código o escribí el nombre del producto",
}: {
  onSelect: (p: Producto) => void;
  onNoEncontrado?: (codigo: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [valor, setValor] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const t = limpiarBusqueda(valor);
    // Si son solo números probablemente es un código: no mostramos lista mientras la lectora escribe.
    if (t.length < 2 || /^\d+$/.test(t)) {
      setResultados([]);
      return;
    }
    const h = setTimeout(async () => {
      const { data } = await supabase
        .from("productos")
        .select("*")
        .eq("activo", true)
        .or(`nombre.ilike.%${t}%,codigo_barras.ilike.%${t}%`)
        .order("nombre")
        .limit(10);
      setResultados((data as Producto[]) ?? []);
      setIdx(0);
    }, 200);
    return () => clearTimeout(h);
  }, [valor]);

  function elegir(p: Producto) {
    onSelect(p);
    setValor("");
    setResultados([]);
    ref.current?.focus();
  }

  async function onEnter() {
    if (resultados.length > 0) return elegir(resultados[idx]);
    const codigo = valor.trim();
    if (!codigo) return;
    // Limpiamos antes de buscar para que una segunda lectura rápida no se pierda.
    setValor("");
    const { data } = await supabase.from("productos").select("*").eq("codigo_barras", codigo).maybeSingle();
    if (data) onSelect(data as Producto);
    else onNoEncontrado?.(codigo);
    ref.current?.focus();
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">▮▯▮</span>
      <input
        ref={ref}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((i) => Math.min(i + 1, resultados.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Escape") {
            setResultados([]);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-md border-2 border-indigo-300 bg-white py-2.5 pl-12 pr-3 text-base focus:border-indigo-600 focus:outline-none"
        autoComplete="off"
      />
      {resultados.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {resultados.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(p)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === idx ? "bg-indigo-50" : "hover:bg-slate-50"}`}
              >
                <span>
                  {p.nombre}
                  {(p.talle || p.color) && <span className="ml-1 text-slate-500">{[p.talle, p.color].filter(Boolean).join(" · ")}</span>}
                  <span className="ml-2 font-mono text-xs text-slate-400">{p.codigo_barras}</span>
                </span>
                <span className="text-right">
                  <span className="font-medium">{pesos(p.precio_venta)}</span>
                  <span className="ml-2 text-xs text-slate-500">stock {p.stock_actual}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
