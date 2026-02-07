<template>
  <div class="page">
    <section class="hero">
      <div>
        <h1>Meta conectado</h1>
        <p>{{ statusMessage }}</p>
      </div>
      <div class="hero-actions">
        <button class="btn btn-primary" type="button" @click="goHome">
          Volver al CRM
        </button>
        <button class="btn btn-secondary" type="button" @click="loadPages">
          Refrescar paginas
        </button>
      </div>
    </section>

    <section class="card form-card">
      <strong>Paginas conectadas</strong>
      <div v-if="pagesLoading" class="status">Cargando paginas...</div>
      <div v-else-if="pagesError" class="status">Error: {{ pagesError }}</div>
      <div v-else class="pages">
        <div v-if="pages.length === 0" class="status">
          No hay paginas conectadas todavia.
        </div>
        <div v-for="page in pages" :key="page.id" class="page-card">
          <div>
            <strong>{{ page.name || 'Pagina' }}</strong>
            <span class="status">ID: {{ page.pageId }}</span>
          </div>
          <span class="tag">Meta</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
const config = useRuntimeConfig()
const apiBase = config.public.apiBase
const route = useRoute()
const router = useRouter()

const pages = ref([])
const pagesLoading = ref(false)
const pagesError = ref('')
const tenantId = 'local'

const statusMessage = computed(() => {
  if (route.query.ok === '1') {
    const count = Number(route.query.pages)
    return Number.isFinite(count)
      ? `Autorizacion completada. Paginas guardadas: ${count}.`
      : 'Autorizacion completada.'
  }
  if (route.query.error) {
    return `Error: ${route.query.error}`
  }
  return 'Revisa el estado de la autorizacion y las paginas conectadas.'
})

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

function goHome() {
  router.push('/')
}

onMounted(loadPages)
</script>
