<template>
  <div class="page">
    <section class="hero">
      <div>
        <h1>CRM Kanban</h1>
        <p>
          Mueve leads por etapas y dispara eventos Meta desde el backend. Conectado a
          Supabase y listo para producción.
        </p>
      </div>
      <div class="hero-actions">
        <button class="btn btn-secondary" type="button" @click="loadLeads">
          Refrescar
        </button>
        <button class="btn btn-primary" type="button" @click="startMetaOAuth">
          Conectar Meta
        </button>
      </div>
    </section>

    <section class="toolbar">
      <div class="status">
        API: <strong>{{ apiBase }}</strong>
        <span v-if="loading"> · Cargando...</span>
        <span v-else-if="error"> · Error: {{ error }}</span>
        <span v-else> · {{ leads.length }} leads</span>
      </div>
      <div class="chips">
        <span class="chip">Nuevo: {{ groupedLeads.nuevo.length }}</span>
        <span class="chip">Contactado: {{ groupedLeads.contactado.length }}</span>
        <span class="chip">Cualificado: {{ groupedLeads.cualificado.length }}</span>
      </div>
    </section>

    <section class="card tabs-card">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-button"
          :class="{ 'is-active': activeTab === tab.key }"
          type="button"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </section>

    <section v-if="activeTab === 'sheet'" class="card form-card sheet-card">
      <div class="sheet-header">
        <strong>Google Sheet (solo lectura)</strong>
        <div class="sheet-actions">
          <button class="btn btn-secondary" type="button" @click="loadSheet">
            Refrescar sheet
          </button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="sheetImporting"
            @click="importSheet"
          >
            {{ sheetImporting ? 'Importando...' : 'Importar a Kanban' }}
          </button>
        </div>
      </div>
      <div class="status" v-if="sheetLoading">Cargando hoja...</div>
      <div class="status" v-else-if="sheetError">Error: {{ sheetError }}</div>
      <div class="status" v-else-if="sheetImportResult">
        Importación: {{ sheetImportResult.created }} creados, {{ sheetImportResult.updated }}
        actualizados, {{ sheetImportResult.skipped }} omitidos.
      </div>
      <div class="status" v-else-if="sheetImportError">Error: {{ sheetImportError }}</div>
      <div v-else class="sheet-body">
        <div class="sheet-meta">
          <a
            v-if="sheetUrl"
            class="sheet-link"
            :href="sheetUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir Google Sheet
          </a>
          <span class="status">Pestaña: {{ sheetTab }}</span>
          <span class="status">Filas: {{ sheetRows.length }}</span>
        </div>
        <div v-if="sheetRows.length === 0" class="status">Sin datos</div>
        <div v-else class="sheet-table">
          <table>
            <thead>
              <tr>
                <th v-for="col in sheetColumns" :key="col">{{ col }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in sheetRows" :key="idx">
                <td v-for="col in sheetColumns" :key="col">
                  {{ row[col] ?? '' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <div v-else class="kanban-panel">
      <section class="card form-card">
        <strong>Meta Pages conectadas</strong>
        <div class="status" v-if="pagesLoading">Cargando páginas...</div>
        <div class="status" v-else-if="pagesError">Error: {{ pagesError }}</div>
        <div class="pages" v-else>
          <div v-if="pages.length === 0" class="status">
            Aún no hay páginas conectadas. Usa “Conectar Meta”.
          </div>
          <div v-for="page in pages" :key="page.id" class="page-card">
            <div>
              <strong>{{ page.name || 'Página' }}</strong>
              <span class="status">ID: {{ page.pageId }}</span>
            </div>
            <span class="tag">Meta</span>
          </div>
        </div>
      </section>
      <section class="card form-card">
      <strong>Nuevo lead</strong>
      <div class="form-grid">
        <input
          v-model.trim="form.fullName"
          class="input"
          type="text"
          placeholder="Nombre completo"
        />
        <input v-model.trim="form.email" class="input" type="email" placeholder="Email" />
        <input v-model.trim="form.phone" class="input" type="tel" placeholder="Teléfono" />
      </div>
      <div>
        <button class="btn btn-primary" type="button" :disabled="saving" @click="createLead">
          {{ saving ? 'Guardando...' : 'Crear lead' }}
        </button>
      </div>
      </section>

      <div class="kanban-title">
        <h2>Kanban</h2>
        <span class="status">Arrastra los leads para cambiar de etapa.</span>
      </div>

      <section class="kanban">
        <article
          v-for="stage in stages"
          :key="stage.key"
          class="card column"
          :data-stage="stage.key"
        :class="{ 'is-drop-target': drag.over === stage.key }"
        @dragover.prevent="onDragOver(stage.key)"
        @dragleave="onDragLeave(stage.key)"
        @drop="onDrop(stage.key)"
        >
          <div class="column-header">
            <h3>{{ stage.label }}</h3>
            <span class="count">{{ groupedLeads[stage.key].length }}</span>
          </div>
          <div class="column-body">
            <div v-if="groupedLeads[stage.key].length === 0" class="status empty">
              Sin leads
            </div>
            <div
              v-for="lead in groupedLeads[stage.key]"
              :key="lead.id"
              class="lead-card"
              :data-stage="lead.stage"
              :class="{ 'is-dragging': drag.leadId === lead.id }"
              draggable="true"
              @dragstart="onDragStart(lead)"
              @dragend="onDragEnd"
            >
              <strong>{{ lead.fullName }}</strong>
              <span v-if="lead.email">{{ lead.email }}</span>
              <span v-else>Sin email</span>
              <span v-if="lead.phone">{{ lead.phone }}</span>
              <span v-else>Sin teléfono</span>
              <div class="lead-actions">
                <span class="tag">{{ lead.source }}</span>
                <select
                  class="input"
                  :value="lead.stage"
                  @change="(event) => updateStage(lead.id, event.target.value)"
                >
                  <option v-for="option in stages" :key="option.key" :value="option.key">
                    {{ option.label }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<script setup>
const config = useRuntimeConfig()
const apiBase = config.public.apiBase

const leads = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const pages = ref([])
const pagesLoading = ref(false)
const pagesError = ref('')
const sheetRows = ref([])
const sheetColumns = ref([])
const sheetLoading = ref(false)
const sheetError = ref('')
const sheetImporting = ref(false)
const sheetImportResult = ref(null)
const sheetImportError = ref('')
const sheetUrl = ref('')
const sheetTab = ref('')
const tenantId = 'local'
const activeTab = ref('kanban')
const tabs = [
  { key: 'kanban', label: 'Kanban' },
  { key: 'sheet', label: 'Google Sheet' }
]

const form = reactive({
  fullName: '',
  email: '',
  phone: ''
})

const stages = [
  { key: 'nuevo', label: 'Nuevo' },
  { key: 'contactado', label: 'Contactado' },
  { key: 'cualificado', label: 'Cualificado' },
  { key: 'cerrado_venta', label: 'Cerrado (venta)' },
  { key: 'cerrado_no_venta', label: 'Cerrado (no venta)' }
]

const drag = reactive({
  leadId: null,
  from: null,
  over: null
})

const groupedLeads = computed(() => {
  const grouped = Object.fromEntries(stages.map((stage) => [stage.key, []]))
  for (const lead of leads.value) {
    if (!grouped[lead.stage]) {
      grouped[lead.stage] = []
    }
    grouped[lead.stage].push(lead)
  }
  return grouped
})

async function loadLeads() {
  loading.value = true
  error.value = ''
  try {
    const response = await $fetch(`${apiBase}/leads`)
    leads.value = response?.data || []
  } catch (err) {
    error.value = err?.data?.error || err?.message || 'No se pudo cargar'
  } finally {
    loading.value = false
  }
}

async function loadPages() {
  pagesLoading.value = true
  pagesError.value = ''
  try {
    const response = await $fetch(`${apiBase}/auth/meta/pages`, {
      params: { tenant: tenantId }
    })
    pages.value = response?.data || []
  } catch (err) {
    pagesError.value = err?.data?.error || err?.message || 'No se pudo cargar'
  } finally {
    pagesLoading.value = false
  }
}

async function loadSheet() {
  sheetLoading.value = true
  sheetError.value = ''
  try {
    const response = await $fetch(`${apiBase}/integrations/sheets`)
    const rows = response?.data || []
    sheetRows.value = rows
    sheetUrl.value = response?.sheetUrl || ''
    sheetTab.value = response?.tab || ''
    sheetColumns.value = rows.length > 0 ? Object.keys(rows[0]) : []
  } catch (err) {
    sheetError.value = err?.data?.error || err?.message || 'No se pudo cargar'
  } finally {
    sheetLoading.value = false
  }
}

async function importSheet() {
  sheetImporting.value = true
  sheetImportError.value = ''
  sheetImportResult.value = null
  try {
    const response = await $fetch(`${apiBase}/integrations/sheets/import`, {
      method: 'POST'
    })
    sheetImportResult.value = response
    await loadLeads()
  } catch (err) {
    sheetImportError.value = err?.data?.error || err?.message || 'No se pudo importar'
  } finally {
    sheetImporting.value = false
  }
}

function startMetaOAuth() {
  if (typeof window === 'undefined') return
  const redirect = `${window.location.origin}/meta/connected`
  const url = `${apiBase}/auth/meta/start?redirect=${encodeURIComponent(
    redirect
  )}&tenant=${encodeURIComponent(tenantId)}`
  window.location.href = url
}

async function createLead() {
  if (!form.fullName) {
    error.value = 'El nombre es obligatorio'
    return
  }

  saving.value = true
  error.value = ''
  try {
    const payload = {
      fullName: form.fullName,
      email: form.email || undefined,
      phone: form.phone || undefined
    }
    const response = await $fetch(`${apiBase}/leads`, {
      method: 'POST',
      body: payload
    })
    if (response?.data) {
      leads.value = [response.data, ...leads.value]
    }
    form.fullName = ''
    form.email = ''
    form.phone = ''
  } catch (err) {
    error.value = err?.data?.error || err?.message || 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}

async function updateStage(leadId, stage) {
  const target = leads.value.find((lead) => lead.id === leadId)
  if (!target || target.stage === stage) return

  const previous = target.stage
  target.stage = stage

  try {
    const response = await $fetch(`${apiBase}/leads/${leadId}`, {
      method: 'PATCH',
      body: { stage }
    })
    if (response?.data) {
      Object.assign(target, response.data)
    }
  } catch (err) {
    target.stage = previous
    error.value = err?.data?.error || err?.message || 'No se pudo actualizar'
  }
}

function onDragStart(lead) {
  drag.leadId = lead.id
  drag.from = lead.stage
}

function onDragEnd() {
  drag.leadId = null
  drag.from = null
  drag.over = null
}

function onDragOver(stageKey) {
  drag.over = stageKey
}

function onDragLeave(stageKey) {
  if (drag.over === stageKey) {
    drag.over = null
  }
}

async function onDrop(stageKey) {
  if (!drag.leadId) return
  const leadId = drag.leadId
  const fromStage = drag.from
  drag.over = null
  if (fromStage === stageKey) {
    onDragEnd()
    return
  }
  await updateStage(leadId, stageKey)
  onDragEnd()
}

onMounted(loadLeads)
onMounted(loadPages)
onMounted(loadSheet)
</script>
