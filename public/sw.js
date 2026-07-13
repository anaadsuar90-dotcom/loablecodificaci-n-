const SHARE_DB = "ximosai-share-target";
const SHARE_STORE = "shares";
const SHARE_KEY = "pending-share";

function abrirBaseCompartida() {
  return new Promise((resolve, reject) => {
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

async function guardarContenidoCompartido(contenido) {
  const db = await abrirBaseCompartida();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(SHARE_STORE, "readwrite");
    transaction.objectStore(SHARE_STORE).put(contenido, SHARE_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;

  event.respondWith(
    (async () => {
      try {
        const formulario = await event.request.formData();
        const archivos = formulario
          .getAll("files")
          .filter((valor) => valor instanceof File);
        await guardarContenidoCompartido({
          title: String(formulario.get("title") || ""),
          text: String(formulario.get("text") || ""),
          url: String(formulario.get("url") || ""),
          files: archivos,
          receivedAt: Date.now(),
        });
        return Response.redirect(new URL("/?share-target=1", self.location.origin).href, 303);
      } catch {
        return Response.redirect(new URL("/?share-error=1", self.location.origin).href, 303);
      }
    })(),
  );
});
