# MVP CRM + Facebook Lead Forms + Meta Conversions

## Objetivo del MVP
Construir un CRM mínimo que:
- **Sincronice automáticamente** leads desde Facebook Lead Forms.
- **Gestione un Kanban** con cambios de etapa.
- **Emita eventos de conversión** a Meta (Pixel + CAPI) cuando el lead avance.

---

## Recomendación de base de datos

### Opción 1: **Supabase (Postgres) — recomendada para el MVP**
**Pros**
- Backend rápido de montar (Auth, API, DB, storage).
- Webhooks y funciones serverless integradas.
- Facilita multi‑tenant y escalabilidad.

**Contras**
- Dependes de un servicio externo.

### Opción 2: **MySQL en tu hosting**
**Pros**
- Control total sobre infraestructura.
- Posible reducción de costos si ya tienes hosting.

**Contras**
- Más trabajo operativo (backups, seguridad, escalado).
- Tienes que construir todo el backend sin ayudas.

**Conclusión**: Para arrancar rápido y validar el modelo, **Supabase** es mejor. Si el producto escala y necesitas control total, puedes migrar a MySQL más adelante.

---

## Arquitectura del MVP (alto nivel)

```
Facebook Lead Ads
        │ (Webhook)
        ▼
 Ingest API (Backend)
        │
        ├── Guardar lead en DB
        └── Insertar lead en Kanban

CRM Frontend (Kanban)
        │
        └── Cambios de etapa
              │
              └── Events API → Meta CAPI
```

---

## Flujos principales

### 1) Ingesta automática de leads
1. Configurar Webhook oficial de Facebook Lead Forms.
2. Recibir lead en endpoint `/webhooks/facebook`.
3. Validar firma de Facebook.
4. Guardar lead en DB.
5. Enviar notificación (opcional).

**Requisitos Meta (OAuth + permisos)**
- El OAuth debe incluir permisos: `pages_read_engagement`, `pages_show_list`, `leads_retrieval` y **`pages_manage_metadata`**.
- Si falta `pages_manage_metadata`, la suscripción del webhook a la página falla y no llegan leads.

### 2) Movimiento en Kanban
1. Usuario cambia etapa en UI.
2. Backend actualiza `lead.stage`.
3. Backend dispara evento interno `lead_stage_changed`.
4. Mapeo de stage → evento Meta.
5. Se envía evento a Meta CAPI.

### 3) Webhook saliente para n8n / Google Sheets (opcional)
Cuando cambia la etapa, el backend puede enviar un webhook a n8n para orquestar
integraciones (por ejemplo, actualizar un Google Sheet).

**Variables de entorno**
- `CRM_WEBHOOK_URL`: URL del webhook de n8n.
- `CRM_WEBHOOK_SECRET`: secreto para firmar el payload (opcional).
- `CRM_WEBHOOK_TIMEOUT_MS`: timeout en ms (opcional, default 5000).

**Payload enviado**
```json
{
  "event": "lead_stage_changed",
  "event_id": "uuid",
  "occurred_at": "2026-02-12T00:00:00.000Z",
  "tenant_id": null,
  "lead": {
    "id": "uuid",
    "meta_lead_id": "123456",
    "full_name": "Juan Perez",
    "email": "juan@mail.com",
    "phone": "+5491112345678",
    "source": "facebook"
  },
  "stage": {
    "from": "nuevo",
    "to": "cerrado_venta"
  }
}
```

**Firma (si `CRM_WEBHOOK_SECRET` está configurado)**
- `x-crm-timestamp`: epoch seconds.
- `x-crm-signature`: HMAC SHA-256 de `${timestamp}.${payload}`.

---

## Mapeo sugerido de etapas → eventos Meta
| Stage Kanban | Evento Meta |
|-------------|-------------|
| Nuevo | Lead |
| Contactado | Contact |
| Cualificado | QualifiedLead |
| Cerrado (venta) | Purchase |
| Cerrado (no venta) | Lead (sin evento) |

---

## Modelo de datos inicial (simplificado)

### Tabla `leads`
- `id` (uuid)
- `full_name`
- `email`
- `phone`
- `source` (facebook)
- `stage` (enum)
- `created_at`
- `updated_at`

### Tabla `lead_events`
- `id` (uuid)
- `lead_id` (fk)
- `event_name`
- `event_time`
- `payload` (jsonb)

### Tabla `facebook_pages`
- `id` (uuid)
- `page_id`
- `access_token`
- `created_at`

---

## Checklist MVP (implementado en este repo)

### Semana 1
- ✅ Base de datos + modelo inicial (`docs/schema.sql`).
- ✅ Endpoint webhook Facebook (`POST /webhooks/facebook`).
- ✅ Ingesta básica de leads (persistencia pendiente de wiring DB real).

### Semana 2
- ✅ CRUD básico de leads (GET/POST/PATCH en API).
- ✅ Cambio de etapa con trigger interno de eventos.

### Semana 3
- ✅ Integración Meta CAPI (cliente HTTP + envío de eventos).
- ✅ Dedupe con `event_id`.
- ✅ Logs de eventos en `lead_events`.

### Semana 4
- ⏳ QA y validación con Meta (pendiente de credenciales reales).
- ⏳ Deploy inicial.

---

## Próximos pasos
Para avanzar, puedo ayudarte a:
- Conectar Supabase/MySQL en producción (migraciones + pooling).
- Implementar verificación de firma de Facebook.
- Implementar UI Kanban (frontend).
- Automatizar el deploy.

