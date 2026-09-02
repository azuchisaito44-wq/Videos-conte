# LavadoYaPoo — Generador de Video Publicitario

Backend que arma videos publicitarios verticales (1080x1920, formato Instagram/TikTok/WhatsApp)
a partir de fotos o clips, texto en pantalla y un audio (voz en off / música).

## Cómo funciona
1. Subes fotos y/o clips en el orden en que quieres que aparezcan.
2. A cada foto le pones un texto opcional (aparece como subtítulo animado) y cuánto dura en pantalla.
3. Subes un audio (opcional) que se coloca de fondo en todo el video.
4. El servidor usa `ffmpeg` para: convertir cada foto en un clip, unir todos los clips en orden,
   y mezclar el audio. Te devuelve el link del MP4 final.

## Desplegar en Railway (igual que El Escriba)
1. Crea un **nuevo servicio** en tu proyecto de Railway (no lo mezcles con el backend de El Escriba,
   para no competir por recursos ni memoria durante el procesamiento de video).
2. Sube esta carpeta como repo (GitHub) o usa `railway up` desde la carpeta.
3. Railway detectará `nixpacks.toml` e instalará `ffmpeg` automáticamente. No necesitas configurar nada más.
4. Una vez desplegado, Railway te da una URL pública (Settings → Networking → Generate Domain,
   igual que hiciste con El Escriba).
5. Abre esa URL en el navegador del celular: ahí está la interfaz para subir fotos y generar el video.

## IMPORTANTE: agregar una fuente de letra
Para que el texto en pantalla se vea bien, agrega un archivo de fuente en:

```
fonts/font.ttf
```

Puedes usar cualquier fuente gratuita, por ejemplo "Poppins Bold" o "Roboto Bold" desde Google Fonts.
Descárgala, renómbrala a `font.ttf` y súbela a esa carpeta antes de desplegar.
Si no agregas la fuente, el video se genera igual pero el texto puede no salir o verse con la fuente
por defecto del sistema.

## Endpoint principal

`POST /generar-video`

- `archivos` (multipart, varios): fotos (.jpg/.png) o clips (.mp4) EN ORDEN
- `audio` (multipart, opcional): archivo de audio de fondo
- `escenas` (texto/JSON): array con el texto y duración de cada foto, ej:
  ```json
  [
    { "texto": "¿No tienes tiempo para lavar tu vehículo?", "duracion": 3 },
    { "texto": "Llegamos hasta donde tú estés", "duracion": 3 }
  ]
  ```

Respuesta:
```json
{ "ok": true, "video_url": "/outputs/lavadoyapoo_ad_xxxx.mp4" }
```

## Recomendación de uso para tu guion
Divide tu guion en escenas cortas (una idea por foto/clip):
1. Persona ocupada, sin tiempo — "¿No tienes tiempo para lavar tu vehículo?"
2. Especialista lavando el auto en casa/oficina — "Llegamos hasta donde tú estés"
3. Detalle del lavado en seco / microfibra — "Tecnología Waterless, sin dañar la pintura"
4. Captura real de tu app (grábala tú) — "Solicita el servicio en segundos"
5. Foto de evidencia (antes/después) — "Recibe fotos del trabajo terminado"
6. Boleta/factura — "Emitimos boleta y factura"
7. Logo + llamado a la acción — "Descarga LavadoYaPoo hoy mismo"

Las fotos/clips genéricos (escenas 1-3) puedes generarlos con una herramienta de IA de video
(Kling, Runway, Veo) si no tienes filmación real. Las capturas de tu app (escena 4) deben ser
reales — una grabación de pantalla tuya usando la app — para no generar publicidad engañosa.

## Notas técnicas
- Formato de salida: 1080x1920 (vertical), 30fps, MP4 (H.264/AAC).
- Los archivos temporales se borran automáticamente después de cada generación.
- Límite por archivo: 200MB (ajustable en `server.js`, variable `limits.fileSize`).
- Si subes un clip de video en vez de una foto, se recorta/normaliza al mismo formato
  pero se ignora el texto en pantalla (por simplicidad de la v1).
