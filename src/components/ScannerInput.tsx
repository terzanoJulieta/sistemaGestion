"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Campo para la lectora de código de barras.
 * La lectora funciona como un teclado: escribe el código y manda Enter.
 * Si mantenés `autoFocus`, el campo recupera el foco solo después de cada lectura.
 */
export function ScannerInput({
  onScan,
  placeholder = "Escaneá o escribí el código y presioná Enter",
  autoFocus = true,
  className = "",
}: {
  onScan: (codigo: string) => void | Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [valor, setValor] = useState("");

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">▮▯▮</span>
      <input
        ref={ref}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const codigo = valor.trim();
            setValor("");
            if (codigo) await onScan(codigo);
            ref.current?.focus();
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-md border-2 border-indigo-300 bg-white py-2.5 pl-12 pr-3 text-base focus:border-indigo-600 focus:outline-none"
        autoComplete="off"
        data-scanner="true"
      />
    </div>
  );
}
