# API MVP

Base URL: `http://localhost:3000`

## Health
### `GET /health`
Checks API status.

### `GET /health/db`
Checks storage status (memory or Supabase) and table accessibility.

## OAuth Meta
### `GET /auth/meta/start`
Inicia OAuth con Meta. Acepta `?tenant=<id>` opcional.

### `GET /auth/meta/callback`
Recibe el `code` de OAuth, guarda páginas y tokens.

### `GET /auth/meta/pages`
Lista páginas conectadas (desde la DB).

## Webhooks
### `POST /webhooks/facebook`
Recibe un lead de Facebook Lead Forms.

**Headers**
- `x-hub-signature-256`: firma HMAC SHA-256 del body (se valida con `FACEBOOK_APP_SECRET`).

**Body (ejemplo)**
```json
{
  "leadgen_id": "1234567890",
  "form_id": "999",
  "created_time": "2024-01-01T00:00:00Z",
  "field_data": [
    {"name": "full_name", "values": ["Juan Perez"]},
    {"name": "email", "values": ["juan@mail.com"]},
    {"name": "phone_number", "values": ["+51999999999"]}
  ]
}
```

**Respuesta**
```json
{ "ok": true }
```

## Leads
### `GET /leads`
Lista leads.

### `POST /leads`
Crea lead manual.

### `PATCH /leads/:id`
Actualiza etapa (`stage`) y dispara evento interno.

## Eventos
### `POST /events/meta`
Dispara un evento Meta (interno). Se usa por el backend al cambiar etapa.

**Body (ejemplo CRM)**
```json
{
  "eventName": "Lead",
  "eventId": "crm-evt-0001",
  "leadId": 1234567890123456,
  "userData": {
    "em": "correo@ejemplo.com",
    "ph": "+5491112345678"
  },
  "customData": {
    "stage": "nuevo"
  }
}
```

Notas:
- `em` y `ph` pueden enviarse en texto plano; el backend los normaliza y hashea (SHA-256).
- `leadId` es opcional pero recomendado (debe coincidir con el Lead ID de Meta).
- `action_source` se envía como `system_generated` y `event_source` como `crm`.
- Configura `META_DATASET_ID` y `META_ACCESS_TOKEN` en `backend/.env`.

**Ejemplo curl**
```bash
curl -X POST "http://localhost:3000/events/meta" \
  -H "Content-Type: application/json" \
  -d "{\"eventName\":\"Lead\",\"eventId\":\"crm-evt-0001\",\"leadId\":1234567890123456,\"userData\":{\"em\":\"correo@ejemplo.com\",\"ph\":\"+5491112345678\"},\"customData\":{\"stage\":\"nuevo\"}}"
```
