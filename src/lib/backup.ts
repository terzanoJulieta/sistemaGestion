import { supabase } from "@/lib/supabase";

export const TABLAS_BACKUP = [
  "categorias",
  "productos",
  "clientes",
  "ventas",
  "venta_items",
  "pagos",
  "devoluciones",
  "devolucion_items",
  "movimientos_stock",
] as const;

const CLAVE_ULTIMO = "ultimo-backup";

export function ultimoBackup(): Date | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(CLAVE_ULTIMO);
  return v ? new Date(v) : null;
}

/** Descarga todas las tablas (de a 1000 filas) y arma el archivo de backup. */
export async function generarBackup(onProgreso?: (tabla: string) => void) {
  const datos: Record<string, unknown[]> = {};
  for (const t of TABLAS_BACKUP) {
    onProgreso?.(t);
    const filas: unknown[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase.from(t).select("*").order("id").range(desde, desde + 999);
      if (error) throw new Error(`No se pudo leer ${t}: ${error.message}`);
      filas.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    datos[t] = filas;
  }
  return {
    sistema: "sistema-gestion-comercio",
    version: 1,
    fecha: new Date().toISOString(),
    cantidades: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v.length])),
    datos,
  };
}

export function descargarArchivo(backup: object) {
  const d = new Date();
  const nombre = `backup-comercio-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json`;
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem(CLAVE_ULTIMO, d.toISOString());
  return nombre;
}
