# Sistema de Gestión del Comercio

App web para un comercio polirrubro (cotillón, ropa, juguetes, librería).
Hecha con **Next.js** (se publica en **Vercel**) y **Supabase** (base de datos y login).

## Módulos

| Sección | Qué hace |
|---|---|
| **Productos** | Alta, baja (desactivar) y modificación. Categorías, talle y color, precio de costo y de venta. Si un producto no trae código de barras, el sistema genera uno interno (EAN-13 que empieza con `20`). |
| **Stock** | Ingreso de mercadería, ajuste por conteo, alerta de stock bajo e historial de cada movimiento. |
| **Clientes** | Alta, baja y modificación, con límite de fiado opcional. |
| **Nueva venta** | Se escanea con la lectora y el producto se agrega solo. Descuento en $ o %, vuelto, y la venta descuenta stock. `F2` confirma la venta. |
| **Comprobante** | Ticket para impresora térmica de 80 mm (no válido como factura). Se abre el diálogo de impresión al confirmar la venta. Una venta se puede anular: devuelve el stock y la saca de la cuenta corriente. |
| **Cuenta corriente** | Ventas fiadas y pagos de cada cliente con saldo. Respeta el límite de fiado. |
| **Pagos** | Registro de todos los pagos de clientes, filtrable por fecha. |

### Lectora de código de barras
La lectora funciona como un teclado: escribe el código y manda Enter. En **Nueva venta**, **Stock** y **Productos** hay un campo con el ícono ▮▯▮ que ya tiene el foco: escaneás y listo. En el mismo campo también se puede escribir el nombre del producto para buscarlo.

## Puesta en marcha

### 1. Supabase
1. Creá un proyecto en [supabase.com](https://supabase.com).
2. Entrá a **SQL Editor → New query**, pegá todo el contenido de `supabase/migrations/0001_esquema_inicial.sql` y tocá **Run**. Después hacé lo mismo, en orden, con `0002_permisos.sql` y `0003_devoluciones_y_precios.sql`.
3. Creá tu usuario: **Authentication → Users → Add user → Create new user** (email y contraseña, tildá *Auto Confirm User*).
4. Para que nadie más pueda registrarse: **Authentication → Sign In / Providers** y desactivá **Allow new users to sign up**.

### 2. Variables de entorno
Los valores están en Supabase, en **Project Settings → API** (URL del proyecto y la clave `anon` / *publishable*).
**Nunca subas estas claves al repositorio ni las pegues en un chat.**

- **En tu computadora:** copiá `.env.example` como `.env.local` y completalo. El archivo `.env.local` ya está ignorado por git.
- **En Vercel:** al importar el repo, en **Settings → Environment Variables** cargá las mismas variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_COMERCIO_NOMBRE`, `NEXT_PUBLIC_COMERCIO_DIRECCION`, `NEXT_PUBLIC_COMERCIO_TELEFONO`, `NEXT_PUBLIC_COMERCIO_CUIT` (datos del comprobante, opcionales)

La clave `anon` es pública por diseño: los datos están protegidos porque cada tabla exige usuario logueado (Row Level Security).

### 3. Correr en tu computadora
```bash
npm install
npm run dev
```
Abrí http://localhost:3000.

### 4. Publicar en Vercel
En [vercel.com](https://vercel.com) → **Add New → Project** → elegí este repo → cargá las variables del paso 2 → **Deploy**.

## Base de datos

- `categorias`, `productos`, `clientes`
- `ventas` + `venta_items`
- `movimientos_stock`: historial de cada cambio de stock
- `pagos`
- Vistas `cuenta_corriente_movimientos` y `clientes_saldo`
- Funciones `crear_venta`, `anular_venta` y `registrar_movimiento_stock`: hacen todo en una sola operación (o se guarda todo o nada).

## Próximamente
- Etiquetas con código de barras para impresora Xprinter. Los productos ya tienen su código, y los que no traían uno tienen un código interno listo para imprimir.
