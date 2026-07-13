const SHARE_DB = "ximosai-share-target";
const SHARE_STORE = "shares";
const SHARE_KEY = "pending-share";

export type ContenidoCompartido = {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
  receivedAt?: number;
};

function abrirBaseCompartida() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SHARE_STORE)) {
        request.result.createObjectStore(SHARE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function consumirContenidoCompartido() {
  if (!("indexedDB" in window)) return null;
  const db = await abrirBaseCompartida();
  const contenido = await new Promise<ContenidoCompartido | null>((resolve, reject) => {
    const transaction = db.transaction(SHARE_STORE, "readwrite");
    const store = transaction.objectStore(SHARE_STORE);
    const request = store.get(SHARE_KEY);
    request.onsuccess = () => {
      const resultado = (request.result as ContenidoCompartido | undefined) ?? null;
      if (resultado) store.delete(SHARE_KEY);
      resolve(resultado);
    };
    request.onerror = () => reject(request.error);
  });
  db.close();
  return contenido;
}
