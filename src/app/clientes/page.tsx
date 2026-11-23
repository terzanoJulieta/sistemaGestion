"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { pesos, limpiarBusqueda } from "@/lib/format";
import type { Cliente } from "@/lib/types";
import { ClienteForm } from "@/components/ClienteForm";
import { Button, ErrorMsg, Input, Modal, PageHeader, Table, td, th } from "@/components/ui";

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [q, setQ] = useState("");
  const [soloDeudores, setSoloDeudores] = useState(false);
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState<Cliente | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    let query = supabase.from("clientes_saldo").select("*").order("nombre").limit(500);
    const t = limpiarBusqueda(q);
    if (t) query = query.or(`nombre.ilike.%${t}%,documento.ilike.%${t}%,telefono.ilike.%${t}%`);
    if (soloDeudores) query = query.gt("saldo", 0);
    if (!verInactivos) query = query.eq("activo", true);
    const { data, error } = await query;
    if (error) setError(mensajeError(error));
    else setClientes(data as Cliente[]);
  }, [q, soloDeudores, verInactivos]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const totalDeuda = clientes.reduce((a, c) => a + Math.max(0, Number(c.saldo ?? 0)), 0);

  return (
    <div>
      <PageHeader title="Clientes" actions={<Button onClick={() => setEditando(null)}>+ Nuevo cliente</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Input className="w-full max-w-sm" placeholder="Buscar por nombre, DNI o teléfono…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloDeudores} onChange={(e) => setSoloDeudores(e.target.checked)} />
          Solo con deuda
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Ver inactivos
        </label>
        <span className="ml-auto text-sm text-slate-600">
          Deuda total listada: <b className="text-amber-700">{pesos(totalDeuda)}</b>
        </span>
      </div>
      <ErrorMsg msg={error} />
      <Table>
        <thead>
          <tr>
            <th className={th}>Cliente</th>
            <th className={th}>DNI / CUIT</th>
            <th className={th}>Teléfono</th>
            <th className={`${th} text-right`}>Límite</th>
            <th className={`${th} text-right`}>Saldo cta. cte.</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {clientes.map((c) => {
            const saldo = Number(c.saldo ?? 0);
            return (
              <tr key={c.id} className={c.activo ? "" : "opacity-50"}>
                <td className={td}>
                  <Link className="font-medium text-indigo-700 hover:underline" href={`/clientes/${c.id}`}>
                    {c.nombre}
                  </Link>
                </td>
                <td className={td}>{c.documento ?? "-"}</td>
                <td className={td}>{c.telefono ?? "-"}</td>
                <td className={`${td} text-right`}>{c.limite_credito != null ? pesos(c.limite_credito) : "Sin límite"}</td>
                <td className={`${td} text-right font-semibold ${saldo > 0 ? "text-amber-700" : saldo < 0 ? "text-green-700" : ""}`}>
                  {pesos(saldo)}
                </td>
                <td className={`${td} text-right`}>
                  <Link href={`/clientes/${c.id}`}>
                    <Button variant="ghost">Cuenta corriente</Button>
                  </Link>
                  <Button variant="ghost" onClick={() => setEditando(c)}>
                    Editar
                  </Button>
                </td>
              </tr>
            );
          })}
          {clientes.length === 0 && (
            <tr>
              <td colSpan={6} className={`${td} text-center text-slate-500`}>
                No hay clientes.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Modal open={editando !== undefined} onClose={() => setEditando(undefined)} title={editando ? "Editar cliente" : "Nuevo cliente"} wide>
        {editando !== undefined && (
          <ClienteForm
            cliente={editando}
            onCancelar={() => setEditando(undefined)}
            onGuardado={() => {
              setEditando(undefined);
              cargar();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
