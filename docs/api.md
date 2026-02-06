# API MVP

Base URL: `http://localhost:3000`

## Webhooks
### `POST /webhooks/facebook`
Recibe un lead de Facebook Lead Forms.

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
