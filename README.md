# CODEX-CRM MVP

Este repositorio contiene el **MVP** de un CRM básico que:
- Sincroniza leads desde Facebook Lead Forms.
- Gestiona un Kanban por etapas.
- Dispara eventos de conversión a Meta (Pixel + CAPI).

## Estructura
- `backend/`: API de ingestión, leads y eventos.
- `docs/`: documentación técnica y checklist de implementación.

## Arranque rápido (API)
1. Instala dependencias:
   ```bash
   cd backend
   npm install
   ```
2. Crea tu `.env` desde `.env.example`.
3. Ejecuta en modo desarrollo:
   ```bash
   npm run dev
   ```

## Documentación
- MVP checklist y flujos: `docs/MVP.md`
- SQL inicial para Supabase: `docs/schema.sql`
- Endpoints y payloads: `docs/api.md`

