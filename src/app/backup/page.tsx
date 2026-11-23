"use client";

import { useEffect, useState } from "react";
import { supabase, mensajeError } from "@/lib/supabase";
import { fechaHora } from "@/lib/format";
import { descargarArchivo, generarBackup, ultimoBackup } from "@/lib/backup";
import { Button, Card, ErrorMsg, Input, PageHeader } from "@/components/ui";

const NOMBRES: Record<string, string> = {
  categorias: "Categorías",
  productos: "Productos",
  clientes: "Clientes",
  ventas: "Ventas",
  venta_items: "Ítems de ventas",
  pagos: "Pagos",
  devoluciones: "Devoluciones",
  devolucion_items: "Ítems devueltos",
  movimientos_stock: "Movimientos de stock",
};

type Backup = { sistema?: string; fecha?: string; cantidades?: Record<string, number>; datos?: unknown };

export default function BackupPage() {
  const [ultimo, setUltimo] = useState<Date | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<Backup | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [restaurando, setRestaurando] = useState(false);

  useEffect(() => setUltimo(ultimoBackup()), []);

  async function descargar() {
    setError(null);
    setOk(null);
    try {
      const b = await generarBackup((t) => setProgreso(`Leyendo ${NOMBRES[t] ?? t}…`));
      const nombre = descargarArchivo(b);
      setUltimo(new Date());
      setOk(`Listo: se descargó ${nombre}. Guardalo en un lugar seguro (por ejemplo Google Drive o un pendrive).`);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setProgreso(null);
    }
  }

  async function elegirArchivo(f: File | undefined) {
    setError(null);
    setOk(null);
    setArchivo(null);
    if (!f) return;
    try {
      const b = JSON.parse(await f.text()) as Backup;
      if (b.sistema !== "sistema-gestion-comercio" || !b.datos) throw new Error("El archivo no es un backup de este sistema.");
      setArchivo(b);
    } catch (e) {
      setError(e instanceof SyntaxError ? "El archivo no se puede leer. ¿Es un backup .json de este sistema?" : mensajeError(e));
    }
  }

  async function restaurar() {
    if (!archivo) return;
    setRestaurando(true);
    setError(null);
    const { error } = await supabase.rpc("restaurar_backup", { p_backup: archivo });
    setRestaurando(false);
    if (error) return setError(mensajeError(error));
    setArchivo(null);
    setConfirmacion("");
    setOk("Backup restaurado. Los datos ahora son los del archivo.");
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Backup de datos" />
      <div className="space-y-4">
        <Card>
          <h2 className="mb-1 font-semibold">Descargar backup</h2>
          <p className="mb-3 text-sm text-slate-600">
            Descarga un archivo con todos los datos: productos, clientes, ventas, pagos, devoluciones y movimientos de stock.
            Conviene hacerlo una vez por semana.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={descargar} disabled={!!progreso}>
              {progreso ?? "Descargar backup"}
            </Button>
            <span className="text-sm text-slate-500">
              {ultimo ? `Último backup desde esta computadora: ${fechaHora(ultimo.toISOString())}` : "Todavía no descargaste ningún backup desde esta computadora."}
            </span>
          </div>
        </Card>

        <ErrorMsg msg={error} />
        {ok && <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</div>}

        <Card>
          <h2 className="mb-1 font-semibold">Restaurar un backup</h2>
          <p className="mb-3 text-sm text-slate-600">
            Reemplaza <b>todos</b> los datos actuales por los del archivo. Usalo solo si perdiste información o cambiás de base de datos.
            Antes de restaurar, descargá un backup de cómo está todo ahora.
          </p>
          <input type="file" accept=".json,application/json" onChange={(e) => elegirArchivo(e.target.files?.[0])} className="text-sm" />
          {archivo && (
            <div className="mt-4 space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <div>
                Backup del <b>{archivo.fecha ? fechaHora(archivo.fecha) : "?"}</b> con:
                <ul className="ml-5 mt-1 list-disc">
                  {Object.entries(archivo.cantidades ?? {}).map(([t, n]) => (
                    <li key={t}>
                      {NOMBRES[t] ?? t}: {n}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                Para confirmar, escribí <b>RESTAURAR</b>:
                <Input className="ml-2 w-40" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
              </div>
              <Button variant="danger" onClick={restaurar} disabled={confirmacion !== "RESTAURAR" || restaurando}>
                {restaurando ? "Restaurando…" : "Reemplazar todos los datos"}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
