"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pesos } from "@/lib/format";
import type { Cliente } from "@/lib/types";
import { Input } from "@/components/ui";

export function ClienteSelector({
  value,
  onChange,
}: {
  value: Cliente | null;
  onChange: (c: Cliente | null) => void;
}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    supabase
      .from("clientes_saldo")
      .select("*")
      .eq("activo", true)
      .order("nombre")
      .limit(2000)
      .then(({ data }) => setClientes((data as Cliente[]) ?? []));
  }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return clientes
      .filter((c) => !t || c.nombre.toLowerCase().includes(t) || (c.documento ?? "").includes(t) || (c.telefono ?? "").includes(t))
      .slice(0, 20);
  }, [q, clientes]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
        <span>
          <b>{value.nombre}</b>
          <span className="ml-2 text-slate-500">saldo {pesos(value.saldo ?? 0)}</span>
        </span>
        <button type="button" className="text-slate-500 hover:text-red-600" onClick={() => onChange(null)}>
          Quitar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        className="w-full"
        placeholder="Consumidor final (buscar cliente…)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
      />
      {abierto && filtrados.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
          {filtrados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50"
                onClick={() => {
                  onChange(c);
                  setQ("");
                  setAbierto(false);
                }}
              >
                <span>{c.nombre}</span>
                <span className="text-slate-500">{pesos(c.saldo ?? 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
