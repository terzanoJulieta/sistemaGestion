"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { fechaHora, pesos } from "@/lib/format";
import { MEDIOS_PAGO, medioPagoLabel, type Cliente, type Venta } from "@/lib/types";
import { ClienteSelector } from "@/components/ClienteSelector";
import { Badge, Button, ErrorMsg, Field, Input, PageHeader, Select, Table, td, th } from "@/components/ui";

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [desde, setDesde] = useState(hoy());
  const [hasta, setHasta] = useState(hoy());
  const [medio, setMedio] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [numero, setNumero] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    let q = supabase
      .from("ventas")
      .select("*, clientes(nombre)")
      .order("fecha", { ascending: false })
      .limit(1000);
    const n = Number(numero.replace(/\D/g, ""));
    if (n) q = q.eq("id", n); // buscando por N° se ignoran las fechas
    if (!n && cliente) q = q.eq("cliente_id", cliente.id);
    if (!n && desde) q = q.gte("fecha", new Date(`${desde}T00:00:00`).toISOString());
    if (!n && hasta) q = q.lt("fecha", new Date(new Date(`${hasta}T00:00:00`).getTime() + 86400000).toISOString());
    if (!n && medio) q = q.eq("medio_pago", medio);
    const { data, error } = await q;
    if (error) setError(mensajeError(error));
    else setVentas(data as Venta[]);
  }, [desde, hasta, medio, cliente, numero]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al elegir un cliente mostramos todas sus compras (se pueden volver a poner fechas).
  function elegirCliente(c: Cliente | null) {
    setCliente(c);
    if (c) {
      setDesde("");
      setHasta("");
    }
  }

  // Desde la ficha del cliente: /ventas?cliente=ID
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("cliente");
    if (id)
      supabase
        .from("clientes_saldo")
        .select("*")
        .eq("id", Number(id))
        .single()
        .then(({ data }) => data && elegirCliente(data as Cliente));
  }, []);

  const confirmadas = ventas.filter((v) => v.estado === "confirmada");
  const total = confirmadas.reduce((a, v) => a + Number(v.total), 0);
  const porMedio = MEDIOS_PAGO.map((m) => ({
    ...m,
    total: confirmadas.filter((v) => v.medio_pago === m.value).reduce((a, v) => a + Number(v.total), 0),
  })).filter((m) => m.total > 0);

  return (
    <div>
      <PageHeader
        title="Ventas"
        actions={
          <Link href="/ventas/nueva">
            <Button>+ Nueva venta</Button>
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Desde">
          <div className="flex gap-1">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <Button variant="ghost" type="button" onClick={() => setDesde("")} title="Sin fecha desde">
              ✕
            </Button>
          </div>
        </Field>
        <Field label="Hasta">
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
        <Field label="Cliente">
          <div className="w-64">
            <ClienteSelector value={cliente} onChange={elegirCliente} placeholder="Todos los clientes" />
          </div>
        </Field>
        <Field label="N° de venta">
          <Input className="w-32" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej: 125" />
        </Field>
        <Field label="Medio de pago">
          <Select value={medio} onChange={(e) => setMedio(e.target.value)}>
            <option value="">Todos</option>
            {MEDIOS_PAGO.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="ml-auto text-right text-sm">
          <div>
            {confirmadas.length} ventas · <b className="text-lg">{pesos(total)}</b>
          </div>
          <div className="text-slate-500">{porMedio.map((m) => `${m.label}: ${pesos(m.total)}`).join(" · ")}</div>
        </div>
      </div>
      <ErrorMsg msg={error} />
      <Table>
        <thead>
          <tr>
            <th className={th}>N°</th>
            <th className={th}>Fecha</th>
            <th className={th}>Cliente</th>
            <th className={th}>Medio de pago</th>
            <th className={`${th} text-right`}>Total</th>
            <th className={th}>Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ventas.map((v) => (
            <tr key={v.id} className={v.estado === "anulada" ? "opacity-50" : ""}>
              <td className={td}>
                <Link href={`/ventas/${v.id}`} className="font-mono text-indigo-700 hover:underline">
                  {String(v.id).padStart(8, "0")}
                </Link>
              </td>
              <td className={td}>{fechaHora(v.fecha)}</td>
              <td className={td}>{v.clientes?.nombre ?? "Consumidor final"}</td>
              <td className={td}>{medioPagoLabel(v.medio_pago)}</td>
              <td className={`${td} text-right font-medium`}>{pesos(v.total)}</td>
              <td className={td}>{v.estado === "anulada" ? <Badge color="red">Anulada</Badge> : <Badge color="green">OK</Badge>}</td>
            </tr>
          ))}
          {ventas.length === 0 && (
            <tr>
              <td colSpan={6} className={`${td} text-center text-slate-500`}>
                No hay ventas en el período.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
