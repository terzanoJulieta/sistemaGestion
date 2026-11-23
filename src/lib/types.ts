export type Categoria = { id: number; nombre: string };

export type Producto = {
  id: number;
  codigo_barras: string;
  codigo_interno: boolean;
  nombre: string;
  descripcion: string | null;
  categoria_id: number | null;
  talle: string | null;
  color: string | null;
  precio_costo: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  activo: boolean;
  categorias?: { nombre: string } | null;
};

export type Cliente = {
  id: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  limite_credito: number | null;
  observaciones: string | null;
  activo: boolean;
  saldo?: number;
};

export type MedioPago = "efectivo" | "debito" | "credito" | "transferencia" | "cuenta_corriente";

export const MEDIOS_PAGO: { value: MedioPago; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cuenta_corriente", label: "Cuenta corriente (fiado)" },
];

export const medioPagoLabel = (m: string) =>
  MEDIOS_PAGO.find((x) => x.value === m)?.label ?? m;

export type Venta = {
  id: number;
  fecha: string;
  cliente_id: number | null;
  subtotal: number;
  descuento: number;
  total: number;
  medio_pago: MedioPago;
  estado: "confirmada" | "anulada";
  observaciones: string | null;
  clientes?: { nombre: string } | null;
};

export type VentaItem = {
  id: number;
  producto_id: number;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
};

export type Pago = {
  id: number;
  fecha: string;
  cliente_id: number;
  monto: number;
  medio_pago: string;
  observaciones: string | null;
  anulado: boolean;
  clientes?: { nombre: string } | null;
};
