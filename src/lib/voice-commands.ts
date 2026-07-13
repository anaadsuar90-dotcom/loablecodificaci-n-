export type ComandoVoz =
  | "ximo salto"
  | "ximo vuelve"
  | "ximo quieto"
  | "ximo dale"
  | "ximo empieza";

export const COMANDOS_VOZ: Record<ComandoVoz, string> = {
  "ximo salto": "Ximo salto",
  "ximo vuelve": "Ximo vuelve",
  "ximo quieto": "Ximo quieto",
  "ximo dale": "Ximo dale",
  "ximo empieza": "Ximo empieza",
};

export function normalizarComandoVoz(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function esComandoVoz(valor: string): valor is ComandoVoz {
  return valor in COMANDOS_VOZ;
}
