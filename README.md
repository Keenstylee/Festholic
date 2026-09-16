# Festholic

Plataforma web/PWA para gestionar eventos, inventario de entradas, ventas,
clientes, promotores y campañas de media partners desde un solo lugar.

La aplicación está construida con HTML, CSS y JavaScript vanilla en el
frontend, y Cloudflare Workers, D1 y R2 en el backend. No requiere un bundle
de React para ejecutarse.

## Ejecutar localmente

Desde esta carpeta:

```powershell
python -m http.server 5178 --bind 127.0.0.1
```

Luego abre:

```text
http://127.0.0.1:5178
```

## Funciones actuales

- Dashboard operativo con métricas por estado.
- Creación, edición, archivo y eliminación de eventos.
- Inventario separado por evento.
- Carga multiple de PDF e imagenes.
- Registro masivo de codigos y cupos de lista.
- Asignacion de comprador, WhatsApp, documento y precio.
- Estados de entrada y pago.
- Descarga, copia y envio por WhatsApp.
- Filtros, seleccion masiva y papelera recuperable.
- Respaldo e importacion de metadatos en JSON.
- Interfaz responsive y estructura PWA.
- Registro de clientes e historial de contacto.
- Webhook de WhatsApp Cloud API para registrar nuevos mensajes y clientes.
- Panel de administración con usuarios, permisos, actividad y métricas.
- Tres experiencias: Asistente, Promotor y Media Partner, con cambio de
  experiencia sin cerrar sesión.
- Compartir entradas desde móvil o PC (Web Share, copia al portapapeles y
  fallback manual).
- Selección múltiple de entradas con acciones masivas y resaltado visual.
- Corrección automática de textos con codificación dañada en Media.

## Cuentas y almacenamiento

El sistema incluye registro e inicio de sesión por usuario, seleccion de
experiencia (promotor, asistente o media partner), verificacion de correo,
recuperacion de contraseña y limitacion de intentos de acceso.

- Promotoria guarda eventos, inventario, clientes y archivos en D1/R2.
- Asistentes y media partners sincronizan su espacio de trabajo por cuenta.
- Las entradas PDF/imagen del asistente se conservan en R2 y mantienen una
  copia local en IndexedDB para acceso rapido.
- Cambiar la contraseña invalida las sesiones anteriores y la cuenta permite
  cerrar sesiones abiertas en otros dispositivos desde `/security.html`.
- La actividad sensible queda registrada para el usuario y para auditoria del
  administrador, sin almacenar contrasenas ni direcciones IP en texto claro.
- Los administradores pueden buscar usuarios, cambiar experiencia o permisos y
  bloquear cuentas desde `/admin.html`.
- El centro `/legal.html` ofrece privacidad, términos, seguridad, soporte,
  exportación de datos y solicitudes de eliminación.

Para desarrollo local se conserva una copia en el navegador, pero la fuente
persistente para usuarios autenticados es la API de Cloudflare.

## Backend de Cloudflare

La carpeta `cloudflare/` contiene la primera version de la API:

- Worker `iampromote-api`.
- Base D1 `iampromote_db`.
- Bucket R2 `iampromote-files`.
- Migracion para eventos, entradas y actividad.
- Endpoints protegidos para datos y archivos.

Las entradas pueden ser PDF, imagen, código canjeable o acceso por lista. Los
códigos importados conservan su `code_value` y tienen un número de operación
(`internal_code`) para su seguimiento.

### Recursos configurados

- Aplicacion: `https://iampromote-api.keenscy10.workers.dev`
- Worker: `iampromote-api`
- D1: `iampromote_db`
- R2: `iampromote-files`

Los endpoints privados validan la cookie de sesión y separan los datos por
usuario. `ADMIN_TOKEN` y Cloudflare Access quedan reservados para tareas
internas; no deben bloquear registro, verificacion ni recuperacion cuando se
habilite el acceso general.

### Despliegue

Desde la raíz del proyecto:

```powershell
npx wrangler deploy --config cloudflare\wrangler.toml
```

El despliegue publica los archivos de `public/` como assets y actualiza el
Worker `iampromote-api`. Después de cambios de frontend, usa `Ctrl + F5` para
evitar caché del navegador.

Antes del primer despliegue:

1. Instalar dependencias con `npm install`.
2. Crear la base D1 y reemplazar su ID en `cloudflare/wrangler.toml`.
3. Crear el bucket R2 `iampromote-files`.
4. Copiar `cloudflare/.dev.vars.example` como `.dev.vars` solo en desarrollo.
5. Configurar `SESSION_SECRET`, `ADMIN_TOKEN`, `RESEND_API_KEY` y `EMAIL_FROM`
   como secretos de Wrangler.
6. Ejecutar todas las migraciones D1, incluidas `0013`, `0014`, `0015`, `0016`, `0017` y `0018`.
7. Desplegar el Worker.

El token de administración no debe escribirse dentro del repositorio.

### WhatsApp Cloud API

El Worker expone este webhook:

```text
https://iampromote-api.keenscy10.workers.dev/api/whatsapp/webhook
```

Configura como secretos de Wrangler:

```powershell
npx wrangler secret put WHATSAPP_VERIFY_TOKEN
npx wrangler secret put WHATSAPP_APP_SECRET
```

En Meta for Developers registra la URL anterior, usa el mismo token de
verificacion y suscribe el campo `messages`. Si Cloudflare Access protege todo
el dominio, crea una política Bypass limitada exclusivamente a
`/api/whatsapp/webhook`; el resto de la aplicacion debe continuar protegido.

Los mensajes entrantes validan la firma `X-Hub-Signature-256`, crean o
actualizan al cliente por número y se conservan en `whatsapp_messages`.

### Verificacion de correo

Las cuentas nuevas pueden verificarse mediante un enlace de un solo uso que
vence en 24 horas. El envio utiliza Resend y se activa cuando existen las dos
variables siguientes en el Worker:

```powershell
npx wrangler secret put RESEND_API_KEY --config cloudflare/wrangler.toml
npx wrangler secret put EMAIL_FROM --config cloudflare/wrangler.toml
```

`EMAIL_FROM` debe usar un dominio previamente verificado en Resend, por
ejemplo `MyFest <acceso@tudominio.com>`. Mientras estas variables no
esten configuradas, el registro conserva el comportamiento anterior para no
bloquear el acceso accidentalmente.

Los cambios de correo también requieren confirmación mediante un enlace de un
solo uso, con vencimiento de una hora. Hasta confirmar, el correo anterior
continúa siendo la dirección de acceso y el usuario puede reenviar el enlace
desde la pantalla de seguridad. En desarrollo, `DEV_EMAIL_PREVIEW=true` permite
probar el flujo sin enviar correos reales.

## Antes de abrir al mercado

El código queda preparado para cuentas publicas, pero antes de aceptar usuarios
reales se debe configurar la infraestructura externa: dominio, remitente de
correo verificado, politicas publicas de Privacidad y Términos, monitoreo,
copias de seguridad de D1/R2 y pruebas de recuperacion. Nunca se debe publicar
`cloudflare/.dev.vars` ni ningun secreto.
