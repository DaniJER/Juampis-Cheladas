# Vice City Cocktails — Bot de WhatsApp

Chatbot de pedidos para una coctelería. Toda la lógica conversacional corre en
este backend NestJS; WhatsApp es solo el transporte de mensajes.

**Canal activo: WhatsApp Cloud API (Meta oficial)**. Se migró desde
Whapi.cloud (automatización no oficial) para evitar el riesgo de que Meta
bloquee el número por detectar un cliente no oficial. El canal de **Whapi**
queda pausado: el código sigue en `src/whapi` pero `WhapiModule` no se
importa en `app.module.ts`. Para reactivarlo, descomenta esa línea (y comenta
`WhatsappModule`) en `src/app.module.ts`.

```
Cliente (WhatsApp) ─► Meta Cloud API ─► NestJS (este repo)
                                          ├─ motor del bot (máquina de estados)
                                          ├─ pedidos + conversación en MySQL
                                          └─ avisa al staff (texto plano) y
                                             lo despacha desde el dashboard
                                          ◄─ notifica al cliente cada cambio de estado
```

## Arquitectura

| Módulo | Responsabilidad |
|---|---|
| `src/bot` | Config del bot por negocio (menú, FAQs, textos — ver "Multi-negocio") + `BotEngineService`, la máquina de estados pura. |
| `src/whatsapp` | **(activo)** Webhook Meta (`GET/POST /webhook/meta/:businessId`), parseo del payload de Meta, y `WhatsappApiService` (cliente Graph API, credenciales por negocio). |
| `src/whapi` | **(pausado)** Webhook (`POST /webhook/whapi/:businessId?secret=...`), parseo del payload de Whapi, `WhapiApiService` (cliente REST de Whapi). |
| `src/conversation` | Estado de cada chat + guard de idempotencia (los webhooks se reintentan), scoped por negocio. |
| `src/orders` | Persistencia y ciclo de vida del pedido (`PENDING → ACCEPTED → PREPARING → READY → DISPATCHED → DELIVERED / CANCELLED`), `OrderStatusService` (transición + aviso al cliente). |
| `src/dispatch` | Avisa al staff de pedidos nuevos (texto plano, sin botones — las transiciones se hacen desde el dashboard). |
| `src/dashboard` | Pantalla web de despacho para el staff (`GET /dashboard`). |

Flujo del cliente: `START → MENU → QUANTITY → ADD_MORE → ADDRESS → CONFIRM`.

## Puesta en marcha (local)

### 1. Dependencias

```bash
npm install
cp .env.example .env   # y completa los valores de WhatsApp
```

### 2. Base de datos (MySQL en Docker)

```bash
npm run db:up            # levanta MySQL + Adminer (http://localhost:8080)
npm run prisma:migrate   # crea las tablas (primera vez pide un nombre de migración)
```

### 3. Correr la app

```bash
npm run start:dev        # http://localhost:3000
```

### 4. Exponer el webhook a Meta

Meta necesita una URL pública HTTPS. En desarrollo:

```bash
npx ngrok http 3000
```

(el plan gratis de ngrok cambia la URL cada vez que lo reinicias — hay que
volver a guardar el webhook en Meta cuando eso pase).

En **Meta for Developers → tu app → WhatsApp → Configuration**:

- URL de devolución de llamada: `https://<tu-subdominio>.ngrok-free.app/webhook/meta/<businessId>`
  (el `businessId` sale de la fila `Business` sembrada — ver abajo
  "Multi-negocio"; cada coctelería tiene su propia URL con su propio
  `businessId`).
- Token de verificación: cualquier string que elijas, debe coincidir con el
  `metaVerifyToken` de esa `Business` (sembrado desde `WHATSAPP_VERIFY_TOKEN`).
- Después de verificar y guardar, **suscríbete al campo `messages`** en la
  lista de "Webhook fields" — sin eso, Meta nunca llama al webhook aunque la
  URL esté bien configurada.

La firma `X-Hub-Signature-256` de cada request se valida contra el
`metaAppSecret` de esa `Business` (Meta for Developers → Settings → Basic →
App Secret). Sin ese secreto configurado, la verificación de firma queda
desactivada (solo para pruebas).

> **Nota:** la API oficial de Meta **sí aplica la ventana de 24 h** de
> conversación — un mensaje de texto libre (ej. un aviso de estado) más de
> 24 h después del último mensaje del cliente requiere una plantilla
> pre-aprobada (HSM). Para el flujo normal de un pedido esto casi nunca se
> cruza. El número de prueba que da Meta solo le puede escribir a números
> agregados como "destinatarios de prueba" en el panel — hace falta
> verificación de negocio para un número de producción real.

## Multi-negocio

El backend es multi-tenant: una sola instancia + una sola base de datos
sirven a varias coctelerías. Cada negocio es una fila en la tabla `Business`
(`prisma/schema.prisma`), con sus propias credenciales de Meta (y de Whapi,
por si se reactiva), lista de staff, API key y config del bot (menú, FAQs,
zonas de domicilio — lo que antes era `bot-config.json`).

- **Sembrar el primer negocio** (o cualquier negocio nuevo, por ahora a mano):
  `npm run prisma:seed` lee `src/bot/bot-config.json` + el `.env` actual y
  crea la fila (si ya existe, la actualiza — útil para refrescar
  credenciales). Para negocios siguientes, créalos directamente en la base
  (Prisma Studio: `npm run prisma:studio`) con su propio `botConfig` JSON.
- **Conectar su canal de Meta**: apunta el webhook de ese negocio (en el
  dashboard de Meta for Developers) a `/webhook/meta/<su businessId>` con su
  propio `metaVerifyToken`.
- **`BotConfigService`** cachea el config de cada negocio en memoria; tras
  editar `Business.botConfig` en la base, hace falta reiniciar el proceso o
  (en el futuro) exponer un endpoint admin que llame a `reload(businessId)`.
- La API de pedidos (`GET /orders`) usa `x-api-key` para identificar **a qué
  negocio pertenece la key** (`Business.adminApiKey`) y filtra todas las
  consultas por ese negocio — una key de un negocio nunca puede ver los
  pedidos de otro.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión MySQL (por defecto apunta al contenedor). |
| `STAFF_WA_IDS`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, `WHAPI_TOKEN`, `WHAPI_WEBHOOK_SECRET`, `WHAPI_BASE_URL` | Solo se usan para **sembrar/refrescar** un negocio (`npm run prisma:seed`). En runtime, todas las credenciales se leen de la fila `Business` en la base, no de env vars. |
| `ADMIN_API_KEY` | Requerido para `GET /orders`/`PATCH /orders/:id/status` (header `x-api-key`) y también usado al sembrar el primer negocio. |

`WHATSAPP_ACCESS_TOKEN` desde el panel de Meta es **temporal (24 h)** salvo
que generes uno permanente vía un System User — si el bot deja de poder
mandar mensajes, revisa primero si el token venció.

## Cómo se despacha un pedido

El staff **ya no gestiona los pedidos desde WhatsApp** — WhatsApp queda para
la conversación del bot con el cliente. El flujo es:

1. El cliente confirma → se crea el `Order` y cada número de `STAFF_WA_IDS`
   recibe un **texto plano** de aviso (sin botones): `🆕 Pedido #N` + resumen.
2. El staff abre el **dashboard** (`GET /dashboard`, ver abajo) en la tablet
   de la barra y ahí mismo cambia el estado del pedido: `PENDING → ACCEPTED →
   PREPARING → READY → DISPATCHED → DELIVERED` (o `CANCELLED` en cualquier
   punto salvo desde `DISPATCHED`/`DELIVERED`).
3. Cada cambio de estado dispara automáticamente el aviso al cliente por
   WhatsApp (mismo texto que antes, ahora enviado por `OrderStatusService`
   en vez de por el tap de un botón).

## Dashboard de despacho (`GET /dashboard`)

Página estática (HTML/JS plano, sin build ni framework — `src/dashboard/`)
para que el staff gestione la cola de pedidos desde una tablet:

- Al abrir, pide la `x-api-key` del negocio (la misma de `GET /orders`) y la
  guarda en `localStorage` del navegador.
- Refresca la lista cada 4s (`GET /orders`) y muestra columnas por estado con
  un botón por cada transición válida (mismo `canTransition` que valida el
  backend en `src/orders/orders.service.ts`).
- Al tocar un botón llama a `PATCH /orders/:id/status`
  (`src/orders/order-status.service.ts`), que valida la transición, actualiza
  el pedido y avisa al cliente — si el aviso falla (ej. token de Meta
  vencido), el cambio de estado igual queda guardado; el error solo se
  loguea.
- La página en sí es pública; sin la API key correcta no se puede leer ni
  cambiar ningún pedido (mismo modelo de `ApiKeyGuard` que ya protege
  `/orders`). Suficiente para un consumidor interno por negocio — si más
  adelante hace falta login por persona de staff, ahí sí conviene auth real.

## Editar el menú / textos

Todo el contenido está en [`src/bot/bot-config.json`](src/bot/bot-config.json):
productos, precios, disponibilidad, FAQs (por palabras clave) y todos los
textos del bot. Se valida al arrancar con Zod. Más adelante esto puede moverse
a la base de datos con un panel de administración.

Placeholders disponibles en textos y FAQs: `{businessName}`, `{location}`,
`{hours}`, `{ratePerKm}` (número crudo) y `{ratePerKmFmt}` (formateado, `1.000`).

## Domicilio: cobro por distancia

El domicilio se cobra a **`delivery.ratePerKm` COP por km** (por defecto 1.000),
**redondeando el km hacia arriba**: `fee = ceil(km) * ratePerKm`.

La distancia por barrio está precalculada en `delivery.zones` de
[`bot-config.json`](src/bot/bot-config.json) — el bot **no** llama a ninguna API
de mapas en tiempo real. Cada zona tiene `name`, `aliases` (formas en que el
cliente escribe el barrio), `km` (distancia de manejo desde `delivery.origin`) y
`fee` (ya calculado).

Flujo: al pedir la dirección, el bot intenta identificar el barrio por el texto;
si no lo reconoce, muestra una **lista de barrios** para que el cliente elija. Si
`delivery.zones` está vacío, usa `delivery.fallbackFee`.

### Regenerar la tabla de km (`npm run zones:build`)

Usa dos servicios **gratis y sin API key** (sin tarjeta de crédito, a
diferencia de Google Maps): [Nominatim](https://nominatim.org) (OpenStreetMap)
para geocodificar cada barrio, y el [router público de OSRM](https://project-osrm.org)
para la distancia de manejo.

1. Edita la lista de barrios en
   [`scripts/delivery-barrios.json`](scripts/delivery-barrios.json)
   (`"Barrio"` o `{ "name": "...", "aliases": ["..."] }`).
2. `delivery.origin` en `bot-config.json` debe ser **coordenadas** (`"lat,lng"`,
   ej. `"3.4470,-76.4721"`) en vez de una dirección de texto — Nominatim
   interpreta mal el formato colombiano "Calle # - #". Consíguelas gratis
   desde Google Maps: clic derecho sobre el punto exacto → copiar
   coordenadas (no hace falta API key para esto, es solo la app web).
3. `npm run zones:build` — geocodifica cada barrio (respeta el límite de
   Nominatim de ~1 request/segundo, así que toma un par de minutos con
   muchos barrios), mide la distancia de manejo desde `delivery.origin`,
   calcula `km` y `fee`, y reescribe `delivery.zones` en `bot-config.json`
   (ordenado por cercanía). `--dry-run` solo lista, sin llamadas de red.
4. **El bot lee `botConfig` desde la base de datos, no desde el archivo** —
   después de correr el script, vuelve a sembrar con `npm run prisma:seed`
   (lee el `bot-config.json` actualizado) y reinicia el proceso para que
   `BotConfigService` recargue el caché en memoria.

Es una tarea ocasional; el resultado se commitea como dato estático — el bot
nunca llama a Nominatim/OSRM en tiempo real. El router público de OSRM es
para uso ligero/ocasional (como este script), no para tráfico alto — si esto
necesita correr muy seguido, hay que auto-hospedar OSRM.

### Recargo por lluvia

Mientras llueve sobre la zona de reparto, el domicilio se multiplica por
`delivery.rain.multiplier` (por defecto `1.3`) y se redondea hacia arriba a
$500. En el resumen sale explícito: `Domicilio (San Fernando · +lluvia ☔): $17.000`.

Detección (`src/weather/WeatherService`), en orden:

1. **Override manual del staff** — un número de `STAFF_WA_IDS` escribe al bot:
   - `lluvia on` → fuerza el recargo
   - `lluvia off` → lo apaga
   - `lluvia auto` (o `lluvia` solo) → vuelve al clima en vivo
2. **[Open-Meteo](https://open-meteo.com)** — clima actual en
   `delivery.rain.lat/lng`. Gratis, **sin API key**. Se cachea 10 min, así que
   una ráfaga de pedidos es una sola llamada HTTP.
3. Si Open-Meteo falla: último valor conocido, o "no llueve" (sin recargo).

El override es en memoria: se pierde si se reinicia el server (vuelve a
automático). Poner `delivery.rain.multiplier` en `1` desactiva todo el mecanismo.

### Preguntas del cliente en cualquier momento

El cliente puede preguntar por el menú, la dirección, el horario, los pagos o
**cuánto va su pedido (con domicilio incluido)** en cualquier punto de la
conversación, sin perder el pedido en curso:

- **Menú / carta / precios** → reenvía la lista de cocteles (`MENU_WORDS` en
  [`bot-engine.service.ts`](src/bot/bot-engine.service.ts)).
- **"¿cuánto llevo?" / "¿cuánto sale con domicilio?"** → devuelve subtotal +
  domicilio + total en vivo (`TOTAL_WORDS`). Antes de elegir barrio usa
  `delivery.fallbackFee`; luego el valor real de la zona.
- **Ubicación / horario / domicilio / pagos** → FAQs por palabras clave de
  `bot-config.json`.

En el estado `ADDRESS` (el cliente está escribiendo su dirección) solo se
reconocen las frases de menú/total, no las palabras clave sueltas de las FAQs,
para no confundir una dirección real con una pregunta.

## Tests

```bash
npm test          # incluye la cobertura del motor del bot (src/bot/bot-engine.service.spec.ts)
```

## API auxiliar

- `GET /orders?status=PENDING` — lista de pedidos del negocio (scoped por `x-api-key`).
- `GET /orders/:id` — detalle de un pedido (404 si no pertenece al negocio de la key).
- `PATCH /orders/:id/status` — cambia el estado y avisa al cliente (usado por el dashboard).

## Pendiente

- Desplegar el backend en un servidor con URL fija (hoy depende de ngrok local, que cambia de URL en cada reinicio — no viable para producción real).
- Token de acceso de Meta permanente (System User), en vez del temporal de 24 h.
- Verificación de negocio en Meta + número de WhatsApp Business de producción (hoy es el número de prueba).
- Panel admin para crear/editar negocios y su config sin tocar la base a mano (fase 3 de la migración multi-tenant).
- Plantillas de WhatsApp aprobadas para notificaciones fuera de la ventana de 24 h (solo aplica al canal Meta).
- Pagos (Nequi / Wompi / Mercado Pago).
- Módulo de inventario.
