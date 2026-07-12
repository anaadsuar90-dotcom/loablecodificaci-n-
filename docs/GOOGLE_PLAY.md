# Preparación para Android y Google Play

Este proyecto usa Capacitor para empaquetar la aplicación web como una aplicación Android nativa.

## Antes de crear Android

- El identificador definitivo de la aplicación es `es.ximosai.estudiocar`. No debe cambiarse después de publicar en Google Play.
- Instala Android Studio y el SDK de Android. Capacitor 8 requiere Android Studio 2025.2.1 o posterior.
- Ejecuta `bun install` (o `npm install`) para actualizar las dependencias y el archivo de bloqueo.

## Generar y abrir Android

```bash
bun run android:add
bun run android:sync
bun run android:open
```

El primer comando crea la carpeta `android/`. Debe conservarse en GitHub; solo se excluyen las carpetas de compilación que genera Android Studio.

En Android Studio:

1. Espera a que finalice la sincronización de Gradle.
2. Conecta un móvil Android por USB o abre un emulador.
3. Pulsa Run para probar la lectura de PDF, Word, TXT y la síntesis de voz.
4. Para Play Store, usa **Build > Generate Signed Bundle / APK > Android App Bundle**.
5. El archivo para Play suele quedar en `android/app/build/outputs/bundle/release/app-release.aab`.

## Privacidad y publicación

Los documentos se procesan localmente en el dispositivo y no se envían a un servidor propio. Aun así, antes de publicar hay que completar la ficha de Datos de seguridad de Google Play y ofrecer una política de privacidad en una URL pública, además de la que ya aparece dentro de la aplicación.

La voz marcada como `(Nube)` puede enviar texto al proveedor de voz elegido por el usuario. Para máxima privacidad, se debe recomendar una voz `(Local)`.

## Comprobaciones obligatorias antes de subir

- Probar carga de Word, PDF con texto y TXT en un móvil real.
- Probar voz local, pausa, reanudación y pantalla bloqueada.
- Crear icono de aplicación, capturas de pantalla y ficha de Play Store.
- Completar política de privacidad pública y la declaración de Datos de seguridad.
- Si la cuenta personal de Play Console es nueva, realizar la prueba cerrada requerida por Google antes de producción.
