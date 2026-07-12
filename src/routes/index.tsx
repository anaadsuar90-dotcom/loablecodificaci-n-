import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ximosaiHeader from "@/assets/ximosai-header.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "XIMOSAIstudiocar - Lectura guiada" },
      { name: "description", content: "Lectura guiada en voz alta a tu ritmo." },
      { name: "theme-color", content: "#0f172a" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Montserrat:wght@400;600;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
      },
    ],
  }),
  component: LectorGuiado,
});

function escaparHTML(texto: string) {
  const mapa: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return texto.replace(/[&<>"']/g, (m) => mapa[m]);
}

function LectorGuiado() {
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  const [vozSeleccionada, setVozSeleccionada] = useState("");
  const [rate, setRate] = useState(1);
  const [texto, setTexto] = useState("");
  const [modoLectura, setModoLectura] = useState(false);
  const [parrafos, setParrafos] = useState<string[]>([]);
  const [indice, setIndice] = useState(0);
  const [estado, setEstado] = useState<"idle" | "playing" | "paused">("idle");
  const [progreso, setProgreso] = useState("A tu ritmo");
  const [avisoManual, setAvisoManual] = useState(false);

  const lectorRef = useRef<HTMLDivElement>(null);
  const lecturaEnCursoRef = useRef(false);
  const indiceRef = useRef(0);
  const parrafosRef = useRef<string[]>([]);
  const vozRef = useRef("");
  const rateRef = useRef(1);
  const palabrasActualesRef = useRef<{ start: number; length: number }[]>([]);
  const palabraActualRef = useRef(0);
  const currentUttRef = useRef<SpeechSynthesisUtterance | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceStartTimeRef = useRef(0);
  const boundaryFiredRef = useRef(false);
  // Cuando true, el scroll automático queda desactivado hasta que el usuario pulse Seguir.
  const autoScrollDesactivadoRef = useRef(false);
  // Long-press detection (2s → pausa total y modo manual)
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressMovedRef = useRef(false);
  const [instruccionesAbiertas, setInstruccionesAbiertas] = useState(false);
  const [avisoPdf, setAvisoPdf] = useState<null | "escaneado" | "copiado">(null);
  const wakeLockRef = useRef<any>(null);

  const PROMPT_PDF = `Transcribe este PDF de forma literal para poder escucharlo en una aplicación de lectura guiada por voz.

Primero quiero SOLO la transcripción del contenido principal del documento, respetando el orden, títulos, apartados y párrafos.

No resumas el texto principal y no añadas explicaciones dentro de la transcripción, salvo que sea necesario indicar que hay una imagen, tabla o elemento visual.

Si hay imágenes, tablas, gráficos o elementos visuales, añade en el punto correspondiente:

'Descripción de la imagen:'

seguido de una descripción breve entre paréntesis de unas 15 a 20 palabras.

Después de terminar toda la transcripción literal, añade una sección final llamada:

'Resumen visual del PDF'

En esa sección final, haz un resumen breve de los elementos visuales importantes del documento: imágenes, tablas, gráficos, esquemas, sellos, firmas o cualquier elemento que ayude a entender el PDF.

Deja el resultado preparado para copiar y pegar en XIMOSAI Estudio Car.`;

  const copiarPromptPdf = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_PDF);
      setAvisoPdf("copiado");
    } catch {
      alert("No se pudo copiar. Copia el prompt manualmente.");
    }
  };

  const limpiarTextoPdf = (t: string) => {
    return t
      .replace(/\r/g, "")
      // Une palabras cortadas por guión al final de línea: "radio-\ndiagnóstico" → "radiodiagnóstico"
      .replace(/-\n(\S)/g, "$1")
      // Une líneas que no terminan en signo de puntuación fuerte (probable salto de línea artificial)
      .replace(/([^\n\.\!\?\:;])\n(?!\n)(\S)/g, "$1 $2")
      // Colapsa 3+ saltos de línea a doble salto (párrafo)
      .replace(/\n{3,}/g, "\n\n")
      // Espacios extra
      .replace(/[ \t]{2,}/g, " ")
      // Espacios antes de puntuación
      .replace(/ +([,\.;:\!\?])/g, "$1")
      .trim();
  };


  useEffect(() => { indiceRef.current = indice; }, [indice]);
  useEffect(() => { parrafosRef.current = parrafos; }, [parrafos]);
  useEffect(() => { vozRef.current = vozSeleccionada; }, [vozSeleccionada]);
  useEffect(() => {
    rateRef.current = rate;
    // Si estamos leyendo, reiniciamos desde la palabra actual para aplicar la nueva velocidad
    // (Web Speech API no permite cambiar rate de una utterance en curso).
    if (lecturaEnCursoRef.current && estado === "playing") {
      const desde = palabraActualRef.current;
      if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
      currentUttRef.current = null;
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      setTimeout(() => leerParrafo(desde), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);



  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const cargar = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        const es = v.filter((x) => x.lang.includes("es"));
        const otras = v.filter((x) => !x.lang.includes("es"));
        setVoces([...es, ...otras]);
      }
    };
    cargar();
    window.speechSynthesis.onvoiceschanged = cargar;
    return () => {
      window.speechSynthesis.cancel();
      liberarWakeLock();
    };
  }, []);

  const pedirWakeLock = async () => {
    try {
      const nav: any = navigator;
      if (nav.wakeLock && !wakeLockRef.current) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
        wakeLockRef.current.addEventListener?.("release", () => {
          wakeLockRef.current = null;
        });
      }
    } catch { /* ignore */ }
  };
  const liberarWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch { /* ignore */ }
  };
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && lecturaEnCursoRef.current && estado === "playing") {
        pedirWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [estado]);

  const manejarArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvisoPdf(null);
    const nombre = file.name.toLowerCase();
    if (nombre.endsWith(".docx")) {
      const buf = await file.arrayBuffer();
      // @ts-expect-error - no types for browser build
      const mammoth = await import("mammoth/mammoth.browser.js");
      try {
        const r = await (mammoth as any).extractRawText({ arrayBuffer: buf });
        setTexto(r.value);
      } catch {
        alert("Error al leer el Word.");
      }
    } else if (nombre.endsWith(".txt")) {
      const r = await file.text();
      setTexto(r);
    } else if (nombre.endsWith(".pdf")) {
      try {
        const buf = await file.arrayBuffer();
        // @ts-expect-error - no types for pdf.mjs subpath
        const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
        // Worker desde el mismo paquete (URL resuelta por Vite)
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;


        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        let textoCompleto = "";
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          let ultimoY: number | null = null;
          let lineaActual = "";
          const lineas: string[] = [];
          for (const item of content.items as any[]) {
            const str: string = item.str ?? "";
            const y = item.transform?.[5];
            if (ultimoY !== null && Math.abs(y - ultimoY) > 2) {
              if (lineaActual.trim()) lineas.push(lineaActual);
              lineaActual = "";
            }
            lineaActual += str;
            if (item.hasEOL) {
              if (lineaActual.trim()) lineas.push(lineaActual);
              lineaActual = "";
            } else if (str && !str.endsWith(" ")) {
              lineaActual += " ";
            }
            ultimoY = y;
          }
          if (lineaActual.trim()) lineas.push(lineaActual);
          textoCompleto += lineas.join("\n") + "\n\n";
        }
        const limpio = limpiarTextoPdf(textoCompleto);
        if (limpio.replace(/\s/g, "").length < 20) {
          setAvisoPdf("escaneado");
          setTexto("");
        } else {
          setTexto(limpio);
        }
      } catch {
        setAvisoPdf("escaneado");
      }
    }
    // reset para poder subir el mismo archivo otra vez
    e.target.value = "";
  };


  // Lee el párrafo actual dividido en bloques cortos (una utterance por bloque).
  // Al terminar cada bloque, se resincroniza y arranca el siguiente.
  const leerParrafo = (startWord: number = 0) => {
    const synth = window.speechSynthesis;
    const i = indiceRef.current;
    const ps = parrafosRef.current;
    if (i >= ps.length || !lecturaEnCursoRef.current) {
      terminar();
      return;
    }
    const textoParrafo = ps[i];

    const wordRegex = /\S+/g;
    const palabras: { start: number; length: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = wordRegex.exec(textoParrafo)) !== null) {
      palabras.push({ start: m.index, length: m[0].length });
    }
    palabrasActualesRef.current = palabras;
    if (startWord < 0) startWord = 0;
    if (startWord >= palabras.length) startWord = Math.max(0, palabras.length - 1);
    palabraActualRef.current = startWord;

    setProgreso(`${i + 1} de ${ps.length}`);

    // Render + marcado de párrafo activo
    const root = lectorRef.current;
    if (root) {
      root.querySelectorAll("p").forEach((p) => {
        p.classList.remove("parrafo-activo");
        p.classList.add("parrafo-inactivo");
      });
      const el = root.querySelector(`#parrafo-${i}`) as HTMLElement | null;
      if (el) {
        el.classList.remove("parrafo-inactivo");
        el.classList.add("parrafo-activo");
        if (!autoScrollDesactivadoRef.current) {
          const offset = el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3;
          window.scrollTo({ top: offset, behavior: "smooth" });
        }
      }
    }

    const renderPalabras = () => {
      const el = lectorRef.current?.querySelector(`#parrafo-${i}`) as HTMLElement | null;
      if (!el) return;
      let html = "";
      let cursor = 0;
      for (let w = 0; w < palabras.length; w++) {
        const p = palabras[w];
        if (p.start > cursor) html += escaparHTML(textoParrafo.substring(cursor, p.start));
        html += `<span class="palabra" data-w="${w}">${escaparHTML(
          textoParrafo.substring(p.start, p.start + p.length),
        )}</span>`;
        cursor = p.start + p.length;
      }
      if (cursor < textoParrafo.length) html += escaparHTML(textoParrafo.substring(cursor));
      el.innerHTML = html;
    };
    renderPalabras();

    const resaltar = (wordIdx: number) => {
      const el = lectorRef.current?.querySelector(`#parrafo-${i}`) as HTMLElement | null;
      if (!el) return;
      el.querySelectorAll(".palabra-activa").forEach((s) => s.classList.remove("palabra-activa"));
      const span = el.querySelector(`[data-w="${wordIdx}"]`) as HTMLElement | null;
      if (!span) return;
      span.classList.add("palabra-activa");
      if (autoScrollDesactivadoRef.current) return;
      const rect = span.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.bottom > vh * 0.6 || rect.top < vh * 0.15) {
        const target = window.scrollY + rect.top - vh * 0.35;
        window.scrollTo({ top: target, behavior: "smooth" });
      }
    };

    // ---- Lectura fluida del párrafo entero con sincronización precisa ----
    // Estrategia: boundary events como fuente de verdad; entre boundaries
    // avanzamos con tempo calibrado en vivo a partir de esos mismos eventos.

    if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }

    const rateActual = rateRef.current || 1;
    // Base inicial (se recalibra con boundaries reales). Español ~65ms/char a 1x.
    let msPorCaracter = 68 / rateActual;

    type Punt = "coma" | "punto_coma" | "punto" | "fin" | null;
    const puntDespues = (idx: number): Punt => {
      const p = palabras[idx];
      if (!p) return null;
      const end = p.start + p.length;
      let k = end;
      while (k < textoParrafo.length && /["'\)\]]/.test(textoParrafo.charAt(k))) k++;
      const ch = textoParrafo.charAt(k);
      if (idx === palabras.length - 1) return "fin";
      if (/[\.\!\?]/.test(ch)) return "punto";
      if (ch === ";") return "punto_coma";
      if (/[,:]/.test(ch)) return "coma";
      return null;
    };

    const duracionPalabra = (idx: number) => {
      const p = palabras[idx];
      if (!p) return 200;
      const chars = p.length + 1; // incluye espacio siguiente
      let d = Math.max(90, chars * msPorCaracter);
      const t = puntDespues(idx);
      if (t === "punto" || t === "fin") d += 300 / rateActual;
      else if (t === "punto_coma") d += 190 / rateActual;
      else if (t === "coma") d += 110 / rateActual;
      return d;
    };

    const textoUtt = textoParrafo.substring(palabras[startWord]?.start ?? 0);
    const offsetChar = palabras[startWord]?.start ?? 0;
    const utt = new SpeechSynthesisUtterance(textoUtt);
    if (vozRef.current) {
      const v = window.speechSynthesis.getVoices().find((x) => x.name === vozRef.current);
      if (v) utt.voice = v;
    }
    utt.rate = rateRef.current;

    let palabraIdx = startWord;
    let ultimoBoundaryTs = 0;
    let ultimoBoundaryIdx = startWord;
    let boundariesRecibidos = 0;

    // Calibra ms/char con la diferencia real entre dos boundaries.
    const calibrar = (idxAnterior: number, idxNuevo: number, dtMs: number) => {
      if (idxNuevo <= idxAnterior || dtMs < 40) return;
      let chars = 0;
      for (let k = idxAnterior; k < idxNuevo && k < palabras.length; k++) {
        chars += palabras[k].length + 1;
      }
      if (chars <= 0) return;
      const nuevoMs = dtMs / chars;
      const mezcla = msPorCaracter * 0.7 + nuevoMs * 0.3;
      msPorCaracter = Math.max(35 / rateActual, Math.min(140 / rateActual, mezcla));
    };

    const programarFallback = (ms: number) => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = setTimeout(avanzarFallback, Math.max(40, ms));
    };

    function avanzarFallback() {
      if (currentUttRef.current !== utt) return;
      if (!lecturaEnCursoRef.current) return;
      if (palabraIdx >= palabras.length) return;
      // Si acaba de llegar un boundary muy reciente, dejar que él mande.
      const desdeBoundary = performance.now() - ultimoBoundaryTs;
      if (boundariesRecibidos > 0 && desdeBoundary < 80) {
        programarFallback(120);
        return;
      }
      palabraActualRef.current = palabraIdx;
      resaltar(palabraIdx);
      const d = duracionPalabra(palabraIdx);
      palabraIdx++;
      programarFallback(d);
    }

    palabraActualRef.current = startWord;
    resaltar(startWord);
    palabraIdx = startWord + 1;
    programarFallback(260 / rateActual);

    utt.onboundary = (event) => {
      if (event.name !== "word") return;
      const ahora = performance.now();
      const charAbs = event.charIndex + offsetChar;
      let idx = startWord;
      for (let k = startWord; k < palabras.length; k++) {
        const p = palabras[k];
        if (charAbs >= p.start && charAbs < p.start + p.length) { idx = k; break; }
        if (charAbs < p.start) { idx = Math.max(startWord, k - 1); break; }
        idx = k;
      }
      if (boundariesRecibidos > 0) {
        calibrar(ultimoBoundaryIdx, idx, ahora - ultimoBoundaryTs);
      }
      boundariesRecibidos++;
      ultimoBoundaryTs = ahora;
      ultimoBoundaryIdx = idx;

      palabraActualRef.current = idx;
      resaltar(idx);
      palabraIdx = idx + 1;

      // Reprogramar fallback con el tempo calibrado; añadir margen en puntuación.
      let siguiente = duracionPalabra(idx);
      const t = puntDespues(idx);
      if (t === "punto" || t === "fin") siguiente += 120 / rateActual;
      else if (t === "punto_coma") siguiente += 80 / rateActual;
      programarFallback(siguiente);
    };

    utt.onend = () => {
      if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
      if (currentUttRef.current !== utt) return;
      if (!lecturaEnCursoRef.current) return;
      indiceRef.current = i + 1;
      setIndice(i + 1);
      leerParrafo(0);
    };

    utt.onerror = (e: any) => {
      if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
      if (currentUttRef.current !== utt) return;
      if (!lecturaEnCursoRef.current) return;
      if (e.error !== "canceled" && e.error !== "interrupted") {
        indiceRef.current = i + 1;
        setIndice(i + 1);
        leerParrafo(0);
      }
    };

    currentUttRef.current = utt;
    synth.speak(utt);
  };

  const iniciar = () => {

    const t = texto.trim();
    if (!t) { alert("Pega un texto primero."); return; }
    const synth = window.speechSynthesis;
    if (!synth) {
      alert("Tu navegador no permite la síntesis de voz en esta vista previa. Abre la app en una pestaña nueva o publícala para usar la lectura.");
      return;
    }
    synth.cancel();
    synth.resume();
    const ps = t.split(/\n+/).filter((p) => p.trim().length > 0);
    if (ps.length === 0) return;
    parrafosRef.current = ps;
    indiceRef.current = 0;
    lecturaEnCursoRef.current = true;
    autoScrollDesactivadoRef.current = false;
    setAvisoManual(false);
    setParrafos(ps);
    setIndice(0);
    setModoLectura(true);
    setEstado("playing");
    pedirWakeLock();
    setTimeout(() => leerParrafo(0), 100);
  };

  const limpiarTimersLectura = () => {
    if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
    boundaryFiredRef.current = false;
  };

  const pausar = () => {
    limpiarTimersLectura();
    try { window.speechSynthesis.pause(); } catch { /* ignore */ }
    currentUttRef.current = null;
    window.speechSynthesis.cancel();
    setEstado("paused");
    liberarWakeLock();
  };
  // Pausa total desencadenada por long-press: además desactiva el auto-scroll
  const pausaTotal = () => {
    pausar();
    autoScrollDesactivadoRef.current = true;
    setAvisoManual(true);
    try { (navigator as any).vibrate?.(60); } catch { /* ignore */ }
  };
  const reanudar = () => {
    if (!lecturaEnCursoRef.current) return;
    const desde = palabraActualRef.current;
    limpiarTimersLectura();
    currentUttRef.current = null;
    window.speechSynthesis.cancel();
    // Al pulsar Seguir manualmente, volvemos a permitir el scroll automático.
    autoScrollDesactivadoRef.current = false;
    setAvisoManual(false);
    setEstado("playing");
    pedirWakeLock();
    setTimeout(() => leerParrafo(desde), 120);
  };
  const togglePausa = () => {
    if (estado === "playing") pausar();
    else if (estado === "paused") reanudar();
  };
  const saltarA = (parrafoIdx: number, palabraIdx: number) => {
    if (!lecturaEnCursoRef.current) return;
    limpiarTimersLectura();
    indiceRef.current = parrafoIdx;
    setIndice(parrafoIdx);
    palabraActualRef.current = Math.max(0, palabraIdx);
    currentUttRef.current = null;
    window.speechSynthesis.cancel();
    autoScrollDesactivadoRef.current = false;
    setAvisoManual(false);
    setEstado("playing");
    pedirWakeLock();
    setTimeout(() => leerParrafo(Math.max(0, palabraIdx)), 120);
  };
  const desplazar = (n: number) => {
    if (!lecturaEnCursoRef.current) return;
    let nuevoIdx = palabraActualRef.current + n;
    let parrafoIdx = indiceRef.current;
    if (n < 0) {
      while (nuevoIdx < 0 && parrafoIdx > 0) {
        parrafoIdx--;
        const palabrasPrev = (parrafosRef.current[parrafoIdx].match(/\S+/g) || []).length;
        nuevoIdx += palabrasPrev;
      }
      if (nuevoIdx < 0) nuevoIdx = 0;
    } else {
      let palabrasActuales = (parrafosRef.current[parrafoIdx].match(/\S+/g) || []).length;
      while (nuevoIdx >= palabrasActuales && parrafoIdx < parrafosRef.current.length - 1) {
        nuevoIdx -= palabrasActuales;
        parrafoIdx++;
        palabrasActuales = (parrafosRef.current[parrafoIdx].match(/\S+/g) || []).length;
      }
      if (nuevoIdx >= palabrasActuales) nuevoIdx = Math.max(0, palabrasActuales - 1);
    }
    saltarA(parrafoIdx, nuevoIdx);
  };

  // Corto: tap sobre una palabra → empieza a leer desde ahí.
  // Largo (2s) sobre cualquier zona del texto → PAUSA TOTAL + modo manual.
  const iniciarPress = (e: React.PointerEvent<HTMLParagraphElement>, parrafoIdx: number) => {
    pressMovedRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      if (pressMovedRef.current) return;
      pausaTotal();
      pressTimerRef.current = null;
    }, 2000);

    const target = e.target as HTMLElement;
    const wAttr = target?.dataset?.w;
    // Guardamos el objetivo del tap corto en el propio elemento para no pisar refs
    (e.currentTarget as any).__tapWord = wAttr != null ? parseInt(wAttr, 10) : null;
    (e.currentTarget as any).__tapPar = parrafoIdx;
  };
  const cancelarPress = (movido: boolean = true) => {
    if (movido) pressMovedRef.current = true;
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const finPress = (e: React.PointerEvent<HTMLParagraphElement>) => {
    const timerActivo = pressTimerRef.current != null;
    cancelarPress(false);
    // Si el timer largo no llegó a dispararse y el dedo no se movió, es un tap corto.
    if (timerActivo && !pressMovedRef.current) {
      const w = (e.currentTarget as any).__tapWord;
      const parIdx = (e.currentTarget as any).__tapPar;
      if (typeof w === "number" && !Number.isNaN(w) && typeof parIdx === "number") {
        saltarA(parIdx, w);
      }
    }
  };

  const detener = () => {
    lecturaEnCursoRef.current = false;
    limpiarTimersLectura();
    window.speechSynthesis.cancel();
    liberarWakeLock();
    terminar();
  };
  const terminar = () => {
    setModoLectura(false);
    setEstado("idle");
    setProgreso("A tu ritmo");
    setParrafos([]);
    setAvisoManual(false);
    autoScrollDesactivadoRef.current = false;
    liberarWakeLock();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      className="min-h-screen pb-12"
      style={{
        backgroundColor: "#f5f0e1",
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E\")",
        fontFamily: "'Montserrat', sans-serif",
        color: "#2c2825",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <style>{`
        .texto-novela { font-family: 'Lora', serif; }
        .palabra-activa { background-color: #ffcdd2; color: #8b0000; border-radius: 0.15rem; padding: 0 0.1rem; transition: background-color 0.1s; }
        .palabra { cursor: pointer; }
        .parrafo-inactivo { opacity: 0.5; }
        .parrafo-activo { opacity: 1; font-size: 1.05em; transition: all 0.3s; }
        .btn-pildora { border-radius: 9999px; padding: 0.65rem 0.75rem; font-weight: 600; font-size: 0.95rem; transition: all 0.2s ease; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem; }
        .btn-rojo { background-color: #e53935; color: white; }
        .btn-naranja { background-color: #d84315; color: white; }
        .btn-gris { background-color: #e0e0e0; color: #424242; }
        .btn-azul { background-color: #1565c0; color: white; }
        .barra-fija { position: sticky; top: 0; z-index: 40; background-color: rgba(245,240,225,0.97); backdrop-filter: blur(6px); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      `}</style>

      <header className="relative overflow-hidden rounded-b-3xl shadow-lg" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <img
          src={ximosaiHeader.url}
          alt="XIMOSAI - Aplicación de Estudio Car"
          className="w-full h-auto block"
        />
      </header>

      {/* Controles fijos arriba durante la lectura */}
      {modoLectura && (
        <div className="barra-fija">
          <div className="max-w-3xl mx-auto px-3 py-3">
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => desplazar(-20)} className="btn-pildora btn-azul" aria-label="Retroceder 20 palabras">
                <i className="fas fa-backward"></i> -20
              </button>
              <button
                onClick={togglePausa}
                className={`btn-pildora ${estado === "playing" ? "btn-naranja" : "btn-rojo"}`}
              >
                {estado === "playing" ? (<><i className="fas fa-pause"></i> Pausa</>) : (<><i className="fas fa-play"></i> Seguir</>)}
              </button>
              <button onClick={() => desplazar(20)} className="btn-pildora btn-azul" aria-label="Avanzar 20 palabras">
                <i className="fas fa-forward"></i> +20
              </button>
              <button onClick={detener} className="btn-pildora btn-gris">
                <i className="fas fa-stop"></i> Parar
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-bold" style={{ color: "#5d4037" }}>Vel {rate.toFixed(1)}x</span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                className="flex-1"
                style={{ accentColor: "#e53935" }}
              />
              <span className="text-xs font-bold" style={{ color: "#5d4037" }}>{progreso}</span>
            </div>
            {avisoManual && (
              <div className="mt-2 text-xs font-semibold rounded-md px-3 py-2" style={{ backgroundColor: "#fff3cd", color: "#6b4a00", border: "1px solid #ffe08a" }}>
                <i className="fas fa-hand-paper mr-1"></i> Lectura pausada. Puedes moverte por el texto y usar los controles. Pulsa <strong>Seguir</strong> para continuar.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 pt-4">
        {!modoLectura && (
          <>
            <div className="flex flex-col gap-3 mb-6 border-b border-gray-300/50 pb-6">
              <button onClick={iniciar} className="btn-pildora btn-rojo" style={{ padding: "0.75rem 1.5rem", fontSize: "1rem", width: "100%" }}>
                <i className="fas fa-headphones"></i> Escuchar Texto
              </button>
              <div className="text-center text-xs font-bold mt-2" style={{ color: "#5d4037" }}>{progreso}</div>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50/80 border border-blue-200 p-3 rounded-lg text-xs text-blue-800 mb-2 font-medium">
                <i className="fas fa-info-circle mr-1"></i> Si estás en el móvil y no se resalta la palabra, elige una voz que diga <strong>(Local)</strong>.
              </div>

              <div className="bg-white/50 p-4 rounded-xl shadow-sm border" style={{ borderColor: "#e8dfc8" }}>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#5d4037" }}>Voz</label>
                <select
                  value={vozSeleccionada}
                  onChange={(e) => setVozSeleccionada(e.target.value)}
                  className="w-full p-2 border-b-2 bg-transparent text-sm focus:outline-none mb-4"
                  style={{ borderColor: "#d84315" }}
                >
                  <option value="">{voces.length === 0 ? "Cargando voces..." : "Voz por defecto"}</option>
                  {voces.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} {v.localService ? "(Local)" : "(Nube)"}
                    </option>
                  ))}
                </select>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#5d4037" }}>
                  Velocidad: {rate.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={rate}
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  className="w-full mt-2"
                  style={{ accentColor: "#e53935" }}
                />
              </div>

              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl active:bg-black/5 transition"
                style={{ borderColor: "#c5b8a5" }}
              >
                <i className="fas fa-file-lines text-4xl mb-2" style={{ color: "#d84315" }}></i>
                <span className="font-bold text-center" style={{ color: "#5d4037" }}>Subir documento Word o PDF</span>
                <input id="file-upload" type="file" accept=".docx,.txt,.pdf" className="hidden" onChange={manejarArchivo} />
              </label>

              {avisoPdf === "escaneado" && (
                <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: "#fff3cd", borderColor: "#ffe08a", color: "#6b4a00" }}>
                  <p className="text-sm font-semibold">
                    <i className="fas fa-triangle-exclamation mr-1"></i> Este PDF no contiene texto extraíble o parece escaneado.
                  </p>
                  <p className="text-sm">
                    Puedes usar ChatGPT para transcribirlo. Pulsa <strong>“Copiar prompt”</strong>, sube el PDF a ChatGPT, pega el prompt y después copia el resultado en XIMOSAI Estudio Car.
                  </p>
                  <button
                    type="button"
                    onClick={copiarPromptPdf}
                    className="btn-pildora btn-naranja w-full"
                    style={{ padding: "0.65rem 1rem" }}
                  >
                    <i className="fas fa-copy"></i> Copiar prompt para transcribir PDF
                  </button>
                </div>
              )}
              {avisoPdf === "copiado" && (
                <div className="rounded-lg border p-3 text-sm font-medium" style={{ backgroundColor: "#e8f5e9", borderColor: "#a5d6a7", color: "#1b5e20" }}>
                  <i className="fas fa-check-circle mr-1"></i> Prompt copiado. Ahora sube el PDF a ChatGPT, pega el prompt y después copia el resultado en esta aplicación.
                </div>
              )}


              <textarea
                rows={8}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="w-full p-4 border rounded-xl bg-white/60 texto-novela text-lg focus:outline-none resize-y shadow-inner"
                style={{ borderColor: "#c5b8a5", color: "#3e2723" }}
                placeholder="Pega aquí el informe..."
              />

              <button
                type="button"
                onClick={() => setInstruccionesAbiertas(true)}
                className="w-full p-3 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2"
                style={{ borderColor: "#d84315", color: "#d84315", backgroundColor: "rgba(255,255,255,0.5)" }}
              >
                <i className="fas fa-book-open"></i> Instrucciones de XIMOSAIstudiocar
              </button>
            </div>
          </>
        )}

        {modoLectura && (
          <>
            <div className="texto-novela text-2xl leading-loose px-2 py-4" style={{ color: "#2c2825" }} ref={lectorRef}>
              {parrafos.map((p, i) => (
                <p
                  key={i}
                  id={`parrafo-${i}`}
                  className="mb-6 parrafo-inactivo"
                  style={{ touchAction: "pan-y" }}
                  onPointerDown={(e) => iniciarPress(e, i)}
                  onPointerMove={() => cancelarPress(true)}
                  onPointerUp={finPress}
                  onPointerCancel={() => cancelarPress(true)}
                  onPointerLeave={() => cancelarPress(true)}
                >
                  {p}
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setInstruccionesAbiertas(true)}
              className="fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center"
              style={{ backgroundColor: "#d84315", color: "white" }}
              aria-label="Instrucciones"
            >
              <i className="fas fa-question"></i>
            </button>
          </>
        )}
      </div>

      {instruccionesAbiertas && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setInstruccionesAbiertas(false)}
        >
          <div
            className="bg-white w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl"
            style={{ color: "#2c2825" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between p-4 border-b" style={{ backgroundColor: "#0f172a", color: "white" }}>
              <h2 className="font-bold text-lg">Instrucciones de XIMOSAIstudiocar</h2>
              <button onClick={() => setInstruccionesAbiertas(false)} className="text-white text-xl px-2" aria-label="Cerrar">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm leading-relaxed">
              <p>XIMOSAIstudiocar es una aplicación de lectura guiada pensada para estudiar documentos y páginas web de forma más cómoda.</p>
              <div>
                <h3 className="font-bold mb-1" style={{ color: "#d84315" }}>Cómo funciona</h3>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Toca una zona del texto para empezar a leer desde ese punto.</li>
                  <li>La aplicación leerá en voz alta y acompañará la lectura con desplazamiento automático.</li>
                  <li>Si quieres parar la lectura y recuperar el control manual, mantén pulsada la pantalla durante <strong>2 segundos</strong>.</li>
                  <li>Al hacerlo, se detendrán la voz y el desplazamiento automático.</li>
                  <li>Después podrás subir o bajar manualmente por el texto.</li>
                  <li>Puedes usar los controles para pausar, continuar, retroceder 20 palabras, avanzar 20 o cambiar la velocidad.</li>
                  <li>La lectura solo continuará cuando pulses de nuevo el botón de <strong>Seguir</strong>.</li>
                </ol>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                <strong>Consejo para el coche:</strong> conecta el móvil al altavoz por Bluetooth, deja el móvil en un soporte visible y usa <strong>-20</strong> si te pierdes.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
