# MyFest — README General (maestro)

> Documento fusionado: combina el README original del proyecto (contexto de producto y reglas de trabajo) con el análisis técnico hecho directamente sobre el código (endpoints, esquema de base de datos, variables de entorno). Pensado para retomar el proyecto con cualquier IA sin depender del chat anterior.

---

## 1. Qué es el proyecto

**MyFest** es una aplicación web/PWA para organizar el trabajo de promotores de conciertos, con dos frentes:

1. **Promotores** — administrar eventos, entradas, PDF, QR, códigos, compradores, pagos, entregas, mensajes y clientes.
2. **Asistentes/Fans** — guardar entradas, ver próximos conciertos, cuenta regresiva, recomendaciones y tarjetas compartibles.

## 2. Ubicaciones importantes

- **Ruta local (PC de trabajo):**
  `C:\Users\Keenscy\OneDrive\Documentos\DOCUMENTACIONES FME\iampromote`
- **URL desplegada (producción):**
  `https://iampromote-api.keenscy10.workers.dev`
- **Último deploy conocido:** 14 de junio de 2026 — si hiciste cambios después de esa fecha, probablemente no estén en producción. Verifica con `npm run deploy:api`.

## 3. Estructura de carpetas

```
iampromote/
├─ index.html              # Panel de promotores
├─ app.js                  # Lógica del panel de promotores
├─ styles.css              # CSS del panel de promotores
├─ fan.html                # Panel de asistentes/fans
├─ fan.js                  # Lógica del panel de asistentes/fans
├─ fan.css                 # CSS visual vivo del panel de asistentes
├─ fan.webmanifest         # Manifest del panel de asistentes
├─ sw.js                   # Service Worker / PWA
├─ login.html / login.js   # Login/registro de usuarios
├─ media.html / media.js   # Media Partners / plan de difusión
├─ experiencia.html        # Selección de experiencia
├─ auth-guard.js           # Protege páginas: redirige a login si no hay sesión
├─ public/                 # Carpeta que Cloudflare realmente publica (ver sección 8)
├─ scripts/version-assets.ps1
└─ cloudflare/
   ├─ wrangler.toml        # Configuración del Worker (bindings D1/R2, variables)
   ├─ src/index.js         # TODO el backend (API Worker), ~1387 líneas
   ├─ .dev.vars            # Secretos reales para desarrollo local (no compartir)
   ├─ .dev.vars.example    # Plantilla de qué secretos se necesitan
   └─ migrations/          # 12 migraciones SQL para D1 (ver sección 6)
```

> Hay archivos `.bak-*` con fecha (ej. `app.js.bak-reservas-codigos-20260721133716`) en la raíz y en `public/`. Son respaldos manuales de versiones anteriores — historial de desarrollo, no afectan el funcionamiento actual.

## 4. Panel de Promotores (`index.html`)

Estética: oscura, operativa, seria.

Funciones implementadas:
- Dashboard operativo; crear, editar, archivar y eliminar eventos.
- Inventario por evento; subida múltiple de PDF e imágenes.
- Registro de códigos y cupos por lista.
- **Estados de entrada:** Disponible → Reservada → Vendida → Entregada → Anulada.
- **Estados de pago:** Pendiente → Parcial → Pagado → Reembolsado.
- Asignación de comprador (nombre opcional, WhatsApp recomendado, precio vendido, método de pago, notas internas).
- Compartir entradas individuales o seleccionadas, con marcado visual de "ya compartida".
- Número/código interno de operación por entrada.
- Papelera con restauración y vaciado.
- Exportación/importación de respaldo JSON.
- Generador de PDF provisional.
- Panel de clientes: importar compradores desde entradas, historial de cliente.
- Mensajes automáticos por evento; subida de flyer por evento; compartir mensajes y flyer.
- Integración inicial con **WhatsApp Cloud API** vía webhook.

## 5. Panel de Asistentes/Fans (`fan.html`, `fan.css`, `fan.js`, `fan.webmanifest`)

Estética: viva, colorida, dinámica, enfocada en concierto/festival (gradientes, tarjetas grandes, efectos visuales, pensada para que el usuario quiera tomar captura y compartir).

Funciones implementadas:
- Guardar eventos personales y entradas (PDF o imagen) — almacenamiento en **IndexedDB** del navegador.
- Próximos conciertos con cuenta regresiva y estados emocionales ("¡Es hoy!", "¡Es mañana!", "Faltan X días").
- Checklist previo al concierto (llevar DNI, cargar celular, liberar almacenamiento, guardar entrada, llegar temprano, divertirse).
- Playlist de Spotify opcional por evento.
- Tarjetas PNG compartibles.
- Tres eventos iniciales de ejemplo con imágenes: Maná, HUGEL, Cochinola.
- Responsive (móvil + escritorio); selector entre panel de Promotores y panel de Asistentes.

## 6. Backend — Cloudflare Workers (`cloudflare/src/index.js`)

### Recursos en la nube (Cloudflare)
- **Worker:** `iampromote-api` → `https://iampromote-api.keenscy10.workers.dev`
- **Base de datos:** D1, `iampromote_db`
- **Almacenamiento de archivos:** R2, bucket `iampromote-files`
- **Protección:** Cloudflare Access (restringido a `keenscy10@gmail.com`)
- **Mensajería:** WhatsApp Cloud API (webhook)
- **Email:** Resend (verificación de cuentas)

### Endpoints principales
**Auth:** `POST /api/auth/login`, `/register`, `/resend-verification`, `GET /verify`, `POST /logout`, `GET /session`

**General:** `GET /api/health`, `GET /api/bootstrap`, `PUT /api/state`, `DELETE /api/trash`

**Eventos:** `POST /api/events`, `PATCH /api/events/:id`, `DELETE /api/events/:id`, `POST /api/event-flyer`, `GET /api/event-flyer/:id`, `DELETE /api/event-flyer/:id`

**Entradas (tickets):** `POST /api/tickets`, `PATCH /api/tickets/:id`, `DELETE /api/tickets/:id`, `POST /api/tickets/:id/restore`

**Archivos:** `POST /api/files`, `GET /api/files/:id`, `DELETE /api/files/:id`

**Feedback:** `POST /api/feedback`, `GET /api/feedback`

**WhatsApp:** `POST /api/whatsapp/webhook` (valida firma `X-Hub-Signature-256`), `GET /api/whatsapp/status`

## 7. Modelo de datos (D1 / SQLite)

**`events`**: id, name, event_date, venue, status (active/archived/cancelled), image_url, timestamps, deleted_at.

**`tickets`**: id, event_id (FK a events), internal_code (único por evento), format (pdf/image/code/list), zone, base_price, sale_price, status (available/reserved/sold/delivered/cancelled), payment_status (pending/partial/paid/refunded), payment_method, buyer_name, buyer_phone, buyer_document, notes, code_value, object_key/file_name/file_type/file_size (archivo en R2), shared_at, timestamps.

**`clients`**: id, phone (permite duplicados entre distintos owners desde migración 12), name, event_id, stage (new/info/pending/paid/delivered/inactive/**delivery**), document, tags, notas, interacciones, último contacto.

**`whatsapp_messages`**: id, client_id, phone, dirección (incoming/outgoing), tipo de mensaje, cuerpo, media_id, timestamps.

**`users`** (multi-tenant): id, email, name, password_hash + salt, role (owner/promoter), status, email_verified_at.

**`email_verification_tokens`**: tokens de verificación de correo.

**`promoter_feedback`**: id, user_id/email/name, categoría, rating (1-5), mensaje.

`events` también tiene: `messages_json` (mensajes automáticos) y campos de flyer (object key en R2, nombre, tipo, tamaño).

## 8. ⚠️ Regla crítica: sincronizar raíz con `public/`

Cloudflare publica los archivos **desde `public/`**, no desde la raíz del proyecto. Si editas un archivo en la raíz, debes copiarlo también a `public/` antes de desplegar:

```
index.html  -> public/index.html
app.js      -> public/app.js
styles.css  -> public/styles.css
fan.html    -> public/fan.html
fan.js      -> public/fan.js
fan.css     -> public/fan.css
sw.js       -> public/sw.js
```

**Antes de desplegar, siempre verificar que `public/` tenga la versión más reciente.**

## 9. Variables de entorno y secretos

**Públicas (`wrangler.toml`):**
- `ALLOWED_ORIGIN` = `http://127.0.0.1:5178`
- `ALLOWED_EMAIL` = `keenscy10@gmail.com`

**Secretos (con `wrangler secret put`, no van en el repo):**
- `ADMIN_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Ya existe `cloudflare/.dev.vars` con valores reales para desarrollo local.

## 10. Comandos útiles

```powershell
# Entrar al proyecto
cd "C:\Users\Keenscy\OneDrive\Documentos\DOCUMENTACIONES FME\iampromote"

# Servidor local simple (frontend)
python -m http.server 5178 --bind 127.0.0.1
# http://127.0.0.1:5178
# http://127.0.0.1:5178/fan.html   (panel de asistentes)

# Migraciones
npm run db:migrate:local
npm run db:migrate:remote

# Desplegar a Cloudflare
npm run deploy:api
```

## 11. WhatsApp Cloud API

- Webhook: `https://iampromote-api.keenscy10.workers.dev/api/whatsapp/webhook`
- Secretos: `npx wrangler secret put WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET`
- El webhook registra mensajes entrantes y crea/actualiza clientes por número de WhatsApp.

**Pendiente en esta integración:**
- Registrar mensajes salientes.
- Buscar conversaciones antiguas.
- Vincular conversaciones con eventos automáticamente.
- Mejorar seguimiento de clientes perdidos.

## 12. Estado actual del proyecto

- MVP funcional y avanzado.
- Panel de promotores: casi completo para uso personal.
- Panel de asistentes: primera versión visual y funcional, creada.
- Falta verificar si hay cambios locales posteriores al 14 de junio de 2026 sin desplegar (ver los `.bak-reservas-codigos-*` como posible pista de trabajo inconcluso en el flujo de códigos de reserva).

## 13. Pendientes recomendados

**Prioridad alta:**
- Sincronizar raíz con `public/`.
- Probar panel de asistentes en móvil real.
- Verificar que las tarjetas PNG compartibles funcionen en Android/iPhone.
- Probar subida y apertura de entradas PDF/imágenes.
- Agregar respaldo completo que incluya archivos, no solo JSON.
- Agregar historial/auditoría por entrada.
- Proteger contra sobreventa si se usa en varios dispositivos.

**Prioridad media:**
- Calendario de contenido para promotores (ver sección 14).
- Reportes de ventas por evento; cálculo de ganancias y comisiones.
- Vista de clientes por evento.
- Mejoras en integración de WhatsApp.

**Prioridad futura:**
- Cuentas para varios promotores; roles (Admin / Promotor / Asistente).
- Login real para usuarios finales; compartir eventos públicos.
- Vincular entradas reales con usuarios asistentes.
- Notificaciones push; integración Spotify más completa; integración con Google Calendar.
- App móvil empaquetada.

## 14. Idea nueva: Calendario de Contenido

Módulo para organizar publicidad de eventos y evitar improvisar publicaciones/reels/noticias/historias.

Cada evento tendría tareas como: noticia web, reel anuncio, carrusel informativo, story con encuesta, recordatorios ("faltan 7 días", "es mañana", "hoy es el evento"), código de descuento, grupo de WhatsApp, playlist recomendada.

Clasificación por prioridad:
- Evento A (alto impacto): 5–8 contenidos.
- Evento B (impacto medio): 3–4 contenidos.
- Evento C (pequeño): 1–2 contenidos.

Diseño deseado: mismo estilo visual vivo del panel de Asistentes (colores fuertes, tarjetas, gradientes, efectos CSS, fotos de eventos), con estado de avance por evento, checklist de contenido y vista semanal.

## 15. Reglas para continuar con otra IA

Antes de editar:
- Revisar primero los archivos actuales.
- No reemplazar el panel de promotores.
- No eliminar la lógica de Cloudflare.
- Mantener sincronizados los archivos raíz y `public/` (sección 8).
- Verificar con `node --check` los archivos JS modificados.
- Probar visualmente en local antes de desplegar.
- No guardar secretos dentro del repositorio.

## 16. Cómo usar este documento

1. Sube la carpeta completa `iampromote/` (o un `.zip`) junto con este README a la IA con la que sigas trabajando.
2. Indica en qué parte quedaste — por ejemplo, el flujo de "códigos de reserva" (visible en los archivos `.bak-reservas-codigos-*`) parece ser el último trabajo en curso.
3. Pide que primero revise los archivos actuales antes de proponer cambios, siguiendo las reglas de la sección 15.
