const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");

const supabaseUrl = process.env.SUPABASE_URL || deriveSupabaseUrl(process.env.DATABASE_URL);
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseKey);
const leadsTable = process.env.CRM_LEADS_TABLE || "leads";
const leadEventsTable = process.env.CRM_LEAD_EVENTS_TABLE || "lead_events";
const pagesTable = process.env.CRM_FACEBOOK_PAGES_TABLE || "facebook_pages";

const supabase = useSupabase
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

function deriveSupabaseUrl(databaseUrl) {
  if (!databaseUrl) return null;
  const match = databaseUrl.match(/@([^:/]+)(?::\d+)?\//);
  if (!match) return null;
  const host = match[1];
  const hostMatch = host.match(/^db\.([^.]+)\.supabase\.co$/);
  if (!hostMatch) return null;
  return `https://${hostMatch[1]}.supabase.co`;
}

const leads = new Map();
const leadEvents = [];
const facebookPages = new Map();

function mapRowToLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    leadId: row.meta_lead_id ?? null,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    stage: row.stage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    leadId: row.lead_id,
    eventName: row.event_name,
    eventTime: row.event_time,
    payload: row.payload,
  };
}

function mapRowToPage(row) {
  if (!row) return null;
  return {
    id: row.id,
    pageId: row.page_id,
    accessToken: row.access_token,
    name: row.name,
    tenantId: row.tenant_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createLead({ leadId, fullName, email, phone, source = "facebook" }) {
  if (!useSupabase) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const lead = {
      id,
      leadId: leadId || null,
      fullName,
      email,
      phone,
      source,
      stage: "nuevo",
      createdAt: now,
      updatedAt: now,
    };
    leads.set(id, lead);
    return lead;
  }

  const { data, error } = await supabase
    .from(leadsTable)
    .insert({
      full_name: fullName,
      email,
      phone,
      source,
      stage: "nuevo",
      meta_lead_id: leadId || null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapRowToLead(data);
}

async function listLeads() {
  if (!useSupabase) {
    return Array.from(leads.values());
  }

  const { data, error } = await supabase.from(leadsTable).select("*").order("created_at", {
    ascending: false,
  });

  if (error) {
    throw error;
  }

  return (data || []).map(mapRowToLead);
}

async function findLeadByMetaId(metaLeadId) {
  if (!metaLeadId) return null;
  if (!useSupabase) {
    for (const lead of leads.values()) {
      if (lead.leadId === metaLeadId) return lead;
    }
    return null;
  }

  const { data, error } = await supabase
    .from(leadsTable)
    .select("*")
    .eq("meta_lead_id", metaLeadId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapRowToLead(data);
}

async function updateLeadStage(id, stage) {
  if (!useSupabase) {
    const lead = leads.get(id);
    if (!lead) return null;
    lead.stage = stage;
    lead.updatedAt = new Date().toISOString();
    return lead;
  }

  const { data, error } = await supabase
    .from(leadsTable)
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return mapRowToLead(data);
}

async function addLeadEvent({ leadId, eventName, payload }) {
  if (!useSupabase) {
    const event = {
      id: uuidv4(),
      leadId,
      eventName,
      eventTime: new Date().toISOString(),
      payload,
    };
    leadEvents.push(event);
    return event;
  }

  const { data, error } = await supabase
    .from(leadEventsTable)
    .insert({
      lead_id: leadId,
      event_name: eventName,
      event_time: new Date().toISOString(),
      payload,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapRowToEvent(data);
}

async function upsertFacebookPage({ pageId, accessToken, name, tenantId }) {
  if (!pageId || !accessToken) return null;
  if (!useSupabase) {
    const page = {
      id: uuidv4(),
      pageId,
      accessToken,
      name,
      tenantId: tenantId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    facebookPages.set(pageId, page);
    return page;
  }

  const { data, error } = await supabase
    .from(pagesTable)
    .upsert(
      {
        page_id: pageId,
        access_token: accessToken,
        name: name || null,
        tenant_id: tenantId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "page_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapRowToPage(data);
}

async function getFacebookPageToken(pageId) {
  if (!pageId) return null;
  if (!useSupabase) {
    return facebookPages.get(pageId)?.accessToken || null;
  }

  const { data, error } = await supabase
    .from(pagesTable)
    .select("access_token")
    .eq("page_id", pageId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.access_token || null;
}

async function listFacebookPages() {
  if (!useSupabase) {
    return Array.from(facebookPages.values());
  }

  const { data, error } = await supabase.from(pagesTable).select("*").order("created_at", {
    ascending: false,
  });

  if (error) {
    throw error;
  }

  return (data || []).map(mapRowToPage);
}

module.exports = {
  createLead,
  listLeads,
  findLeadByMetaId,
  updateLeadStage,
  addLeadEvent,
  upsertFacebookPage,
  getFacebookPageToken,
  listFacebookPages,
  getStorageHealth,
};

async function getStorageHealth() {
  if (!useSupabase) {
    return {
      mode: "memory",
      ok: true,
    };
  }

  const checks = {
    leads: { ok: false },
    leadEvents: { ok: false },
  };

  const leadsQuery = await supabase.from(leadsTable).select("id").limit(1);
  checks.leads = leadsQuery.error
    ? { ok: false, error: leadsQuery.error.message }
    : { ok: true };

  const eventsQuery = await supabase.from(leadEventsTable).select("id").limit(1);
  checks.leadEvents = eventsQuery.error
    ? { ok: false, error: eventsQuery.error.message }
    : { ok: true };

  const ok = checks.leads.ok && checks.leadEvents.ok;

  return {
    mode: "supabase",
    ok,
    checks,
  };
}
