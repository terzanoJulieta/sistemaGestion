"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { pesos, limpiarBusqueda } from "@/lib/format";
import type { Categoria, Producto } from "@/lib/types";
import { Badge, Button, ErrorMsg, Field, Input, Modal, PageHeader, Select, Table, td, th } from "@/components/ui";
import { ScannerInput } from "@/components/ScannerInput";
import { AumentoMasivo } from "@/components/AumentoMasivo";

type Form = {
  id?: number;
  codigo_barras: string;
  nombre: string;
  descripcion: string;
  categoria_id: string;
  talle: string;
  color: string;
  precio_costo: string;
  precio_venta: string;
  margen: string;
  stock_inicial: string;
  stock_minimo: string;
  activo: boolean;
};

const vacio = (codigo = ""): Form => ({
  codigo_barras: codigo,
  nombre: "",
  descripcion: "",
  categoria_id: "",
  talle: "",
  color: "",
  precio_costo: "",
  precio_venta: "",
  margen: "",
  stock_inicial: "",
  stock_minimo: "0",
  activo: true,
});


export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nuevaCat, setNuevaCat] = useState("");
  const [aumento, setAumento] = useState(false);
  const [ok, setOk] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    let query = supabase.from("productos").select("*, categorias(nombre)").order("nombre").limit(500);
    const t = limpiarBusqueda(q);
    if (t) query = query.or(`nombre.ilike.%${t}%,codigo_barras.ilike.%${t}%`);
    if (cat) query = query.eq("categoria_id", Number(cat));
    if (!verInactivos) query = query.eq("activo", true);
    const { data, error } = await query;
    if (error) setError(mensajeError(error));
    else setProductos(data as Producto[]);
  }, [q, cat, verInactivos]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const cargarCategorias = useCallback(async () => {
    const { data } = await supabase.from("categorias").select("*").order("nombre");
    setCategorias(data ?? []);
  }, []);

  useEffect(() => {
    cargarCategorias();
  }, [cargarCategorias]);

  function editar(p: Producto) {
    setError(null);
    setForm({
      id: p.id,
      codigo_barras: p.codigo_barras,
      nombre: p.nombre,
      descripcion: p.descripcion ?? "",
      categoria_id: p.categoria_id ? String(p.categoria_id) : "",
      talle: p.talle ?? "",
      color: p.color ?? "",
      precio_costo: String(p.precio_costo),
      precio_venta: String(p.precio_venta),
      margen: p.margen_ganancia != null ? String(Number(p.margen_ganancia)) : "",
      stock_inicial: "",
      stock_minimo: String(p.stock_minimo),
      activo: p.activo,
    });
  }

  async function onScan(codigo: string) {
    setAviso(null);
    const { data } = await supabase.from("productos").select("*").eq("codigo_barras", codigo).maybeSingle();
    if (data) editar(data as Producto);
    else {
      setAviso(`No existe un producto con el código ${codigo}. Cargalo ahora.`);
      setError(null);
      setForm(vacio(codigo));
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setGuardando(true);
    setError(null);
    const datos = {
      codigo_barras: form.codigo_barras.trim(), // vacío → el sistema genera uno interno
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      talle: form.talle.trim() || null,
      color: form.color.trim() || null,
      precio_costo: Number(form.precio_costo || 0),
      precio_venta: Number(form.precio_venta || 0),
      margen_ganancia: form.margen === "" ? null : Number(form.margen),
      stock_minimo: Number(form.stock_minimo || 0),
      activo: form.activo,
    };
    const res = form.id
      ? await supabase.from("productos").update(datos).eq("id", form.id).select().single()
      : await supabase.from("productos").insert(datos).select().single();
    if (res.error) {
      setGuardando(false);
      setError(mensajeError(res.error));
      return;
    }
    const stockIni = Number(form.stock_inicial || 0);
    if (!form.id && stockIni !== 0) {
      const { error } = await supabase.rpc("registrar_movimiento_stock", {
        p_producto_id: res.data.id,
        p_tipo: "inicial",
        p_cantidad: stockIni,
        p_motivo: "Stock inicial",
      });
      if (error) setError(mensajeError(error));
    }
    setGuardando(false);
    setForm(null);
    setAviso(null);
    cargar();
  }

  async function agregarCategoria() {
    const nombre = nuevaCat.trim();
    if (!nombre || !form) return;
    const { data, error } = await supabase.from("categorias").insert({ nombre }).select().single();
    if (error) return setError(mensajeError(error));
    await cargarCategorias();
    setForm({ ...form, categoria_id: String(data.id) });
    setNuevaCat("");
  }

  // Precio de lista + % de ganancia → precio de venta (y al revés)
  const redondear2 = (n: number) => String(Math.round(n * 100) / 100);
  function cambiarPrecios(campo: "precio_costo" | "margen" | "precio_venta", valor: string) {
    if (!form) return;
    const f = { ...form, [campo]: valor };
    const costo = Number(f.precio_costo);
    if (campo === "precio_venta") {
      f.margen = costo > 0 && valor !== "" ? redondear2(((Number(valor) - costo) / costo) * 100) : f.margen;
    } else if (f.margen !== "" && f.precio_costo !== "") {
      f.precio_venta = redondear2(costo * (1 + Number(f.margen) / 100));
    }
    setForm(f);
  }

  return (
    <div>
      <PageHeader
        title="Productos"
        actions={
          <>
            <Button variant="secondary" onClick={() => setAumento(true)}>
              Aumento masivo
            </Button>
            <Button
              onClick={() => {
                setError(null);
                setForm(vacio());
              }}
            >
              + Nuevo producto
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
        <ScannerInput onScan={onScan} placeholder="Escaneá un producto para editarlo o darlo de alta" autoFocus={!form} />
        <Input placeholder="Buscar por nombre o código…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Ver inactivos
        </label>
      </div>

      {!form && <ErrorMsg msg={error} />}
      {ok && <div className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</div>}

      <Modal open={aumento} onClose={() => setAumento(false)} title="Aumento masivo de precios" wide>
        {aumento && (
          <AumentoMasivo
            categorias={categorias}
            onCancelar={() => setAumento(false)}
            onAplicado={(n) => {
              setAumento(false);
              setOk(`Precios actualizados en ${n} productos.`);
              cargar();
            }}
          />
        )}
      </Modal>

      <Table>
        <thead>
          <tr>
            <th className={th}>Código</th>
            <th className={th}>Producto</th>
            <th className={th}>Categoría</th>
            <th className={`${th} text-right`}>Lista</th>
            <th className={`${th} text-right`}>% Gan.</th>
            <th className={`${th} text-right`}>Precio</th>
            <th className={`${th} text-right`}>Stock</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {productos.map((p) => (
            <tr key={p.id} className={p.activo ? "" : "opacity-50"}>
              <td className={`${td} font-mono text-xs`}>
                {p.codigo_barras}
                {p.codigo_interno && <span className="ml-1 text-slate-400" title="Código generado por el sistema">(int.)</span>}
              </td>
              <td className={td}>
                {p.nombre}
                {(p.talle || p.color) && (
                  <span className="ml-1 text-slate-500">{[p.talle, p.color].filter(Boolean).join(" · ")}</span>
                )}
              </td>
              <td className={td}>{p.categorias?.nombre ?? "-"}</td>
              <td className={`${td} text-right`}>{pesos(p.precio_costo)}</td>
              <td className={`${td} text-right text-slate-500`}>{p.margen_ganancia != null ? `${Number(p.margen_ganancia)}%` : "-"}</td>
              <td className={`${td} text-right font-medium`}>{pesos(p.precio_venta)}</td>
              <td className={`${td} text-right`}>
                {p.stock_actual <= p.stock_minimo ? <Badge color="red">{p.stock_actual}</Badge> : p.stock_actual}
              </td>
              <td className={`${td} text-right`}>
                <Button variant="ghost" onClick={() => editar(p)}>
                  Editar
                </Button>
              </td>
            </tr>
          ))}
          {productos.length === 0 && (
            <tr>
              <td className={`${td} text-center text-slate-500`} colSpan={8}>
                No hay productos.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Editar producto" : "Nuevo producto"} wide>
        {form && (
          <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
            {aviso && <div className="rounded bg-amber-50 p-2 text-sm text-amber-800 sm:col-span-2">{aviso}</div>}
            <Field label="Código de barras">
              <Input
                value={form.codigo_barras}
                onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })}
                placeholder="Vacío = se genera uno interno"
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              />
            </Field>
            <Field label="Nombre *">
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required autoFocus />
            </Field>
            <Field label="Categoría">
              <Select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nueva categoría">
              <div className="flex gap-2">
                <Input className="flex-1" value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} placeholder="Ej: Disfraces" />
                <Button type="button" variant="secondary" onClick={agregarCategoria}>
                  Agregar
                </Button>
              </div>
            </Field>
            <Field label="Talle">
              <Input value={form.talle} onChange={(e) => setForm({ ...form, talle: e.target.value })} placeholder="Opcional (ropa)" />
            </Field>
            <Field label="Color">
              <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Opcional" />
            </Field>
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              <Field label="Precio de lista">
                <Input type="number" step="0.01" min="0" value={form.precio_costo} onChange={(e) => cambiarPrecios("precio_costo", e.target.value)} />
              </Field>
              <Field label="% de ganancia">
                <Input type="number" step="0.01" value={form.margen} onChange={(e) => cambiarPrecios("margen", e.target.value)} placeholder="Ej: 60" />
              </Field>
              <Field label="Precio de venta *">
                <Input type="number" step="0.01" min="0" required value={form.precio_venta} onChange={(e) => cambiarPrecios("precio_venta", e.target.value)} />
              </Field>
              <p className="col-span-3 -mt-1 text-xs text-slate-500">
                Cargá el precio de lista y el % de ganancia, y el precio de venta se calcula solo. Si cambiás el precio de venta a mano, se recalcula el %.
              </p>
            </div>
            {!form.id && (
              <Field label="Stock inicial">
                <Input type="number" step="1" value={form.stock_inicial} onChange={(e) => setForm({ ...form, stock_inicial: e.target.value })} />
              </Field>
            )}
            <Field label="Stock mínimo (aviso de reposición)">
              <Input type="number" step="1" min="0" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} />
            </Field>
            <Field label="Descripción" className="sm:col-span-2">
              <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </Field>
            {form.id && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
                Activo (desmarcá para darlo de baja sin perder el historial)
              </label>
            )}
            {form.id && <p className="text-xs text-slate-500 sm:col-span-2">Para cambiar el stock usá la sección Stock, así queda registrado el movimiento.</p>}
            <div className="sm:col-span-2">
              <ErrorMsg msg={error} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
