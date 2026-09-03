# Juampis Cheladas — Bot de WhatsApp

Chatbot de pedidos para una coctelería, sobre **WhatsApp Cloud API** (Meta for
Developers). Toda la lógica conversacional corre en este backend NestJS; Meta
solo es el transporte de mensajes.

```
Cliente (WhatsApp) ─► Meta Cloud API ─► NestJS (este repo)
                                          ├─ motor del bot (máquina de estados)
                                          ├─ pedidos + conversación en MySQL
                                          └─ despacho: manda el pedido al staff
                                             por WhatsApp con botones
                                          ◄─ notifica al cliente cada cambio de estado
```

## Arquitectura

| Módulo | Responsabilidad |
|---|---|
| `src/bot` | `bot-config.json` (menú, FAQs, textos) + `BotEngineService`, la máquina de estados pura. |
| `src/whatsapp` | Webhook (`GET/POST /webhook`), parseo del payload de Meta, y `WhatsappApiService` (cliente Graph API). |
| `src/conversation` | Estado de cada chat + guard de idempotencia (Meta reintenta los webhooks). |
| `src/orders` | Persistencia y ciclo de vida del pedido (`PENDING → ACCEPTED → PREPARING → READY → DISPATCHED → DELIVERED / CANCELLED`). |
| `src/dispatch` | Notifica al staff con botones y procesa sus respuestas para avanzar el pedido. |

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

En **Meta App → WhatsApp → Configuration → Webhook**:

- Callback URL: `https://<tu-subdominio>.ngrok-free.app/webhook`
- Verify token: el mismo valor de `WHATSAPP_VERIFY_TOKEN`
- Suscríbete al campo **messages**.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión MySQL (por defecto apunta al contenedor). |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta App → WhatsApp → API Setup. |
| `WHATSAPP_ACCESS_TOKEN` | Token de **System User** de larga duración (no el temporal de 24 h). |
| `WHATSAPP_VERIFY_TOKEN` | Cadena aleatoria que eliges; debe coincidir con la config del webhook. |
| `WHATSAPP_API_VERSION` | Versión del Graph API (`v21.0`). |
| `META_APP_SECRET` | Opcional. Si se define, se valida la firma `X-Hub-Signature-256`. |
| `STAFF_WA_IDS` | Teléfonos del staff separados por coma, formato internacional sin `+` (ej. `573001112233`). |

## Cómo se despacha un pedido

1. El cliente confirma → se crea el `Order` y se envía un mensaje con botones a cada número de `STAFF_WA_IDS`: **Aceptar / Rechazar**.
2. Staff pulsa **Aceptar** → pedido `ACCEPTED`, el cliente recibe aviso, al staff le llegan botones **Listo / Cancelar**.
3. **Listo** → `READY`, aviso al cliente, botón **Despachado**.
4. **Despachado** → `DISPATCHED`, aviso final al cliente.

> **Ventana de 24 h:** Meta solo permite mensajes de formato libre dentro de las 24 h posteriores al último mensaje del usuario. Para que el bot pueda escribirle al staff, cada número de staff debe haber escrito algo al bot en las últimas 24 h, o hay que usar plantillas aprobadas. Para producción conviene registrar una plantilla de "nuevo pedido".

## Editar el menú / textos

Todo el contenido está en [`src/bot/bot-config.json`](src/bot/bot-config.json):
productos, precios, disponibilidad, FAQs (por palabras clave) y todos los
textos del bot. Se valida al arrancar con Zod. Más adelante esto puede moverse
a la base de datos con un panel de administración.

## Tests

```bash
npm test          # incluye la cobertura del motor del bot (src/bot/bot-engine.service.spec.ts)
```

## API auxiliar

- `GET /orders?status=PENDING` — lista de pedidos (sin auth todavía; es la costura para el dashboard de staff de la fase 2).
- `GET /orders/:id` — detalle de un pedido.

## Pendiente (fase 2+)

- Dashboard web tipo KDS con cola en vivo (WebSocket) y auth de staff.
- Plantillas de WhatsApp aprobadas para notificaciones fuera de la ventana de 24 h.
- Pagos (Nequi / Wompi / Mercado Pago).
- Validación de zona de cobertura por dirección.
- Panel de administración del menú.
