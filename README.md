# Festholic

Festholic es un ecosistema web para la industria del entretenimiento. Centraliza la operación de eventos, la gestión de entradas y la comunicación con el público en una sola plataforma.

El proyecto conecta tres experiencias:

- **Asistente:** descubre eventos, guarda sus entradas y consulta sus próximos eventos.
- **Promotor:** administra eventos, inventario, reservas, ventas, clientes y entregas.
- **Media Partner:** organiza contenido, campañas y publicaciones relacionadas con los eventos.

## Problema que resuelve

La operación de un evento suele repartirse entre hojas de cálculo, conversaciones, archivos PDF y diferentes servicios. Esto dificulta conocer el inventario real, identificar a cada comprador, compartir entradas y mantener un historial de la operación.

Festholic propone un espacio unificado para reducir esa fragmentación y dar seguimiento al ciclo completo: evento, entrada, cliente, venta y comunicación.

## Funcionalidades principales

### Operación para promotores

- Dashboard con métricas de eventos, inventario, ventas, reservas e ingresos.
- Creación, edición, archivo y eliminación de eventos.
- Inventario separado por evento.
- Carga múltiple de entradas en PDF e imagen.
- Registro masivo de códigos y accesos por lista.
- Asignación de comprador, WhatsApp, documento y precio.
- Estados de entrada y pago, incluyendo reservas y entregas.
- Filtros, selección múltiple, acciones masivas y papelera recuperable.
- Descarga, copia y envío de entradas por WhatsApp.
- Registro de clientes e historial de contacto.

### Experiencia para asistentes

- Vista de próximos y pasados eventos.
- Guardado de entradas y consulta desde computadora o teléfono.
- Copia local en IndexedDB para facilitar el acceso a los archivos.
- Interfaz responsive y estructura de aplicación web progresiva (PWA).

### Herramientas para media partners

- Espacio de trabajo para contenido y campañas.
- Gestión de publicaciones asociadas a eventos.
- Corrección de textos con codificación dañada.

### Cuenta y seguridad

- Registro e inicio de sesión por usuario.
- Cambio de experiencia entre Asistente, Promotor y Media Partner.
- Verificación de correo y recuperación de contraseña.
- Control de sesiones, permisos y actividad sensible.
- Panel administrativo para usuarios, permisos, métricas y auditoría.

## Arquitectura y tecnologías

```text
Navegador (HTML, CSS, JavaScript vanilla, PWA)
                    |
                    v
        Cloudflare Worker / API REST
             |                    |
             v                    v
        D1 (datos)            R2 (archivos)
```

- **Frontend:** HTML, CSS y JavaScript vanilla, sin dependencia de React ni bundler para ejecutarse.
- **Backend:** Cloudflare Workers con endpoints REST protegidos por sesión.
- **Base de datos:** Cloudflare D1 para usuarios, eventos, entradas, clientes, mensajes y auditoría.
- **Archivos:** Cloudflare R2 para PDF, imágenes y otros archivos de entradas.
- **Integraciones:** WhatsApp Cloud API para webhook y registro de mensajes; Resend para verificación de correo.
- **Persistencia local:** IndexedDB para facilitar el acceso a entradas del asistente durante el desarrollo y uso offline parcial.

## Estructura del proyecto

```text
festholic/
├── public/                 # páginas, estilos, scripts e imágenes del frontend
├── cloudflare/
│   ├── src/index.js        # Worker y API del backend
│   ├── migrations/         # migraciones de la base D1
│   └── wrangler.toml       # configuración de Cloudflare
├── services/               # servicios auxiliares, incluido QR
├── scripts/                # utilidades de soporte
├── index.html              # entrada principal de la experiencia Promotor
├── experiencia.html        # selector de experiencia
├── fan.html                # experiencia Asistente
├── media.html              # experiencia Media Partner
├── package.json
└── README.md
```

## Ejecutar localmente

Desde la raíz del proyecto:

```powershell
python -m http.server 5178 --bind 127.0.0.1
```

Luego abre `http://127.0.0.1:5178` en el navegador.

Para trabajar con el backend de Cloudflare se requiere configurar Wrangler, D1, R2 y las variables locales indicadas en `cloudflare/.dev.vars.example`.

## Despliegue

```powershell
npm install
npx wrangler deploy --config cloudflare\wrangler.toml
```

El despliegue publica los archivos de `public/` como assets y actualiza el Worker. Después de cambios de frontend, utiliza `Ctrl + F5` para descartar la caché del navegador.

Nunca se deben publicar secretos, contraseñas, tokens ni el archivo `cloudflare/.dev.vars`. El repositorio utiliza `.gitignore` para excluirlos.

## Estado del proyecto

Festholic cuenta con un frontend funcional, API en Cloudflare y módulos para las tres experiencias del ecosistema. El primer avance académico formaliza el proyecto en GitHub, documenta su arquitectura y establece una base para continuar con control de versiones, pruebas y mejoras de seguridad.

## Repositorio

[https://github.com/Keenstylee/Festholic](https://github.com/Keenstylee/Festholic)

## Próximas mejoras

- Automatizar pruebas de flujos críticos de reservas, ventas y entrega.
- Mejorar observabilidad, copias de seguridad y recuperación de D1/R2.
- Consolidar documentación para colaboradores y despliegues.
- Convertir servicios auxiliares en APIs privadas cuando se requiera un entorno comercial.
