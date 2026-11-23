const moneda = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export const pesos = (n: number | string | null | undefined) => moneda.format(Number(n ?? 0));

export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

export const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-AR");

/** Inicio del día local en ISO, para filtrar por fecha. */
export function inicioDelDia(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

export const comercio = {
  nombre: process.env.NEXT_PUBLIC_COMERCIO_NOMBRE || "Mi Comercio",
  direccion: process.env.NEXT_PUBLIC_COMERCIO_DIRECCION || "",
  telefono: process.env.NEXT_PUBLIC_COMERCIO_TELEFONO || "",
  cuit: process.env.NEXT_PUBLIC_COMERCIO_CUIT || "",
};

/** Quita caracteres que rompen los filtros `or` de Supabase. */
export const limpiarBusqueda = (q: string) => q.replace(/[,()%*]/g, " ").trim();
