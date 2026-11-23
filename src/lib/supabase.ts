import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. Copiá .env.example a .env.local y completalas.",
  );
}

export const supabase = createBrowserClient(url ?? "http://localhost", key ?? "missing-key");

/** Convierte errores de Supabase/Postgres en un mensaje legible. */
export function mensajeError(err: unknown): string {
  if (!err) return "Error desconocido";
  if (typeof err === "string") return err;
  const e = err as { message?: string; code?: string };
  if (e.code === "23505") return "Ya existe un registro con ese dato (por ejemplo, el código de barras).";
  if (e.code === "23503") return "No se puede borrar porque tiene movimientos asociados. Podés desactivarlo.";
  return e.message ?? "Error desconocido";
}
