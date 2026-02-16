const fs = require("fs");
const path = require("path");
const rootEnvPath = path.resolve(__dirname, "..", "..", ".env");
if (fs.existsSync(rootEnvPath)) {
  require("dotenv").config({ path: rootEnvPath });
} else {
  require("dotenv").config();
}
const express = require("express");
const morgan = require("morgan");
const crypto = require("crypto");
const cors = require("cors");
const axios = require("axios");

const { buildMetaPayload, sendMetaEvent } = require("./metaClient");
const {
  createLead,
  listLeads,
  getLeadById,
  findLeadByMetaId,
  findLeadByEmail,
  updateLeadStage,
  addLeadEvent,
  upsertFacebookPage,
  getFacebookPageToken,
  listFacebookPages,
  getStorageHealth,
} = require("./storage");
const { mapStageToMetaEvent } = require("./stageMapping");
const { parseLeadPayload, parseLeadFields, extractLeadgenInfo } = require("./facebookParser");

const app = express();
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);
app.use(cors());
app.use(morgan("dev"));

const PORT = process.env.PORT || 3000;
const EVENT_SOURCE = "crm";
const LEAD_EVENT_SOURCE = process.env.CRM_NAME || "Codex CRM";
const META_GRAPH_BASE = "https://graph.facebook.com/v24.0";
const META_OAUTH_BASE = "https://www.facebook.com/v24.0/dialog/oauth";

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_REDIRECT_URI = process.env.META_REDIRECT_URI;
const META_APP_SCOPES =
  process.env.META_APP_SCOPES ||
  "pages_read_engagement,leads_retrieval,pages_show_list,pages_manage_metadata";
const CRM_WEBHOOK_URL = process.env.CRM_WEBHOOK_URL;
const CRM_WEBHOOK_SECRET = process.env.CRM_WEBHOOK_SECRET;
const CRM_WEBHOOK_TIMEOUT_MS = Number(process.env.CRM_WEBHOOK_TIMEOUT_MS || 5000);
const CRM_SHEETS_READ_URL = process.env.CRM_SHEETS_READ_URL;
const CRM_SHEETS_URL = process.env.CRM_SHEETS_URL;
const CRM_SHEETS_TAB = process.env.CRM_SHEETS_TAB || "Hoja 2";
const CRM_SHEETS_TIMEOUT_MS = Number(process.env.CRM_SHEETS_TIMEOUT_MS || 5000);

const oauthStateStore = new Map();

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/health/db", async (req, res) => {
  try {
    const status = await getStorageHealth();
    res.json(status);
  } catch (err) {
    handleServerError(res, err);
  }
});

app.get("/auth/meta/start", (req, res) => {
  if (!META_APP_ID || !META_REDIRECT_URI) {
    return res.status(500).json({ error: "META_APP_ID/META_REDIRECT_URI missing" });
  }

  const redirectUri = resolveRedirectUri(req, req.query?.redirect);
  const state = createOauthState({ tenantId: req.query?.tenant, redirectUri });
  const url = `${META_OAUTH_BASE}?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(
    META_REDIRECT_URI
  )}&state=${state}&scope=${encodeURIComponent(META_APP_SCOPES)}`;

  return res.redirect(url);
});

app.get("/auth/meta/callback", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  let oauthState = null;
  if (state) {
    try {
      oauthState = validateOauthState(String(state));
    } catch (err) {
      return res.status(400).json({ error: err?.message || "Invalid OAuth state" });
    }
  }

  if (error) {
    if (oauthState?.redirectUri) {
      const redirect = buildRedirectUrl(oauthState.redirectUri, {
        ok: "0",
        error: String(error),
      });
      return res.redirect(redirect);
    }
    return res.status(400).json({ error, errorDescription });
  }
  if (!code || !state) {
    return res.status(400).json({ error: "Missing code/state" });
  }

  try {
    const tenantId = oauthState?.tenantId ?? null;
    const accessToken = await exchangeCodeForToken(String(code));
    const pages = await fetchUserPages(accessToken);
    const stored = [];

    for (const page of pages) {
      const saved = await upsertFacebookPage({
        pageId: page.id,
        accessToken: page.access_token,
        name: page.name,
        tenantId,
      });
      stored.push(saved);

      await subscribePageToWebhook(page.id, page.access_token);
    }

    if (oauthState?.redirectUri) {
      const redirect = buildRedirectUrl(oauthState.redirectUri, {
        ok: "1",
        pages: String(stored.length),
      });
      return res.redirect(redirect);
    }

    res.json({ ok: true, pages: stored.length, stored });
  } catch (err) {
    handleServerError(res, err);
  }
});

app.get("/auth/meta/pages", async (req, res) => {
  try {
    const tenantId = typeof req.query?.tenant === "string" ? req.query.tenant : null;
    const pages = await listFacebookPages({ tenantId });
    res.json({ data: pages });
  } catch (err) {
    handleServerError(res, err);
  }
});

app.get("/webhooks/facebook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.status(403).json({ error: "Verification failed" });
});

app.post("/webhooks/facebook", async (req, res) => {
  if (!verifyFacebookSignature(req)) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  try {
    const payload = req.body;
    const leadgenInfo = extractLeadgenInfo(payload);

    if (leadgenInfo?.leadgenId) {
      const existing = await findLeadByMetaId(leadgenInfo.leadgenId);
      if (existing) {
        return res.json({ ok: true, lead: existing, deduped: true });
      }

      const pageToken = await getFacebookPageToken(leadgenInfo.pageId);
      if (!pageToken) {
        return res.status(400).json({ error: "No page token for leadgen" });
      }

      const leadDetails = await fetchLeadDetails(leadgenInfo.leadgenId, pageToken);
      const leadData = parseLeadFields(leadDetails.field_data || []);
      const lead = await createLead({
        ...leadData,
        leadId: leadgenInfo.leadgenId,
        source: "facebook",
      });

      await addLeadEvent({
        leadId: lead.id,
        eventName: "lead_ingested",
        payload: { webhook: payload, lead: leadDetails },
      });

      return res.json({ ok: true, lead });
    }

    const leadData = parseLeadPayload(payload);
    const lead = await createLead({ ...leadData, source: "facebook" });

    await addLeadEvent({
      leadId: lead.id,
      eventName: "lead_ingested",
      payload,
    });

    res.json({ ok: true, lead });
  } catch (err) {
    handleServerError(res, err);
  }
});

app.get("/leads", async (req, res) => {
  try {
    const data = await listLeads();
    res.json({ data });
  } catch (err) {
    handleServerError(res, err);
  }
});

app.post("/leads", async (req, res) => {
  const { fullName, email, phone } = req.body;
  if (!fullName) {
    return res.status(400).json({ error: "fullName is required" });
  }

  try {
    const lead = await createLead({ fullName, email, phone, source: "manual" });
    res.status(201).json({ data: lead });
  } catch (err) {
    handleServerError(res, err);
  }
});

app.patch("/leads/:id", async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;
  if (!stage) {
    return res.status(400).json({ error: "stage is required" });
  }

  try {
    const existing = await getLeadById(id);
    if (!existing) {
      return res.status(404).json({ error: "Lead not found" });
    }
    const previousStage = existing.stage;

    const lead = await updateLeadStage(id, stage);
    const webhookResult = await emitStageWebhook({
      lead,
      previousStage,
      nextStage: stage,
    });

    const eventName = mapStageToMetaEvent(stage);
    let metaResponse = null;

    if (eventName) {
      const eventId = crypto.randomUUID();
      const payload = buildMetaPayload({
        datasetId: process.env.META_DATASET_ID,
        pixelId: process.env.META_PIXEL_ID,
        accessToken: process.env.META_ACCESS_TOKEN,
        eventName,
        eventTime: Math.floor(Date.now() / 1000),
        eventId,
        userData: {
          em: lead.email ? normalizeHash(lead.email) : undefined,
          ph: lead.phone ? normalizeHash(normalizePhone(lead.phone)) : undefined,
          ...(lead.leadId ? { lead_id: lead.leadId } : {}),
        },
        customData: {
          lead_id: lead.id,
          stage,
        },
        testEventCode: process.env.META_TEST_EVENT_CODE,
        eventSource: EVENT_SOURCE,
        leadEventSource: LEAD_EVENT_SOURCE,
      });

      metaResponse = await sendMetaEvent(payload);

      await addLeadEvent({
        leadId: lead.id,
        eventName: `meta_${eventName}`,
        payload: metaResponse,
      });
    }

    res.json({ data: lead, meta: metaResponse, webhook: webhookResult });
  } catch (err) {
    handleServerError(res, err);
  }
});

app.post("/events/meta", async (req, res) => {
  const { eventName, eventId, userData, customData, leadId } = req.body;
  if (!eventName || !eventId) {
    return res.status(400).json({ error: "eventName and eventId are required" });
  }

  try {
    const normalizedUserData = {
      ...(userData || {}),
      ...(leadId ? { lead_id: leadId } : {}),
      ...(userData?.lead_id ? { lead_id: userData.lead_id } : {}),
      ...(userData?.em ? { em: normalizeHash(userData.em) } : {}),
      ...(userData?.ph ? { ph: normalizeHash(normalizePhone(userData.ph)) } : {}),
    };

    const payload = buildMetaPayload({
      datasetId: process.env.META_DATASET_ID,
      pixelId: process.env.META_PIXEL_ID,
      accessToken: process.env.META_ACCESS_TOKEN,
      eventName,
      eventTime: Math.floor(Date.now() / 1000),
      eventId,
      userData: normalizedUserData,
      customData: customData || {},
      testEventCode: process.env.META_TEST_EVENT_CODE,
      eventSource: EVENT_SOURCE,
      leadEventSource: LEAD_EVENT_SOURCE,
    });

    const metaResponse = await sendMetaEvent(payload);
    res.json({ ok: true, meta: metaResponse });
  } catch (err) {
    handleServerError(res, err);
  }
});

app.get("/integrations/sheets", async (req, res) => {
  if (!CRM_SHEETS_READ_URL || !CRM_SHEETS_URL) {
    return res.status(400).json({ error: "Sheets integration not configured" });
  }

  const tab = typeof req.query?.tab === "string" ? req.query.tab : CRM_SHEETS_TAB;

  try {
    const response = await axios.post(
      CRM_SHEETS_READ_URL,
      { sheet_url: CRM_SHEETS_URL, tab_name: tab },
      {
        timeout: CRM_SHEETS_TIMEOUT_MS,
        validateStatus: (status) => status >= 200 && status < 300,
      }
    );

    const raw = response.data;
    const rows = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.rows)
        ? raw.rows
        : Array.isArray(raw?.data)
          ? raw.data
          : [];

    res.json({ data: rows, sheetUrl: CRM_SHEETS_URL, tab });
  } catch (err) {
    const message = err?.response?.data || err?.message || "Sheets fetch failed";
    res.status(502).json({ error: message });
  }
});

app.post("/integrations/sheets/import", async (req, res) => {
  if (!CRM_SHEETS_READ_URL || !CRM_SHEETS_URL) {
    return res.status(400).json({ error: "Sheets integration not configured" });
  }

  const tab = typeof req.query?.tab === "string" ? req.query.tab : CRM_SHEETS_TAB;

  try {
    const rows = await fetchSheetRows({ tab });
    const results = { created: 0, updated: 0, skipped: 0, total: rows.length };

    for (const row of rows) {
      const mapped = mapSheetRowToLead(row);
      if (!mapped) {
        results.skipped += 1;
        continue;
      }

      let existing = null;
      if (mapped.leadId) {
        existing = await findLeadByMetaId(mapped.leadId);
      }
      if (!existing && mapped.email) {
        existing = await findLeadByEmail(mapped.email);
      }

      if (existing) {
        if (mapped.stage && existing.stage !== mapped.stage) {
          await updateLeadStage(existing.id, mapped.stage);
          results.updated += 1;
        } else {
          results.skipped += 1;
        }
        continue;
      }

      await createLead(mapped);
      results.created += 1;
    }

    res.json({ ok: true, ...results });
  } catch (err) {
    const message = err?.response?.data || err?.message || "Sheets import failed";
    res.status(502).json({ error: message });
  }
});

function hashValue(value) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function verifyFacebookSignature(req) {
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appSecret) return true;

  const signature = req.get("x-hub-signature-256");
  if (!signature || !req.rawBody) return false;

  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function normalizeHash(value) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (isSha256(normalized)) return normalized;
  return hashValue(normalized);
}

function normalizePhone(value) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function handleServerError(res, err) {
  console.error(err);
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err?.message || "Internal server error";
  res.status(500).json({ error: message });
}

function createOauthState({ tenantId, redirectUri }) {
  const state = crypto.randomBytes(16).toString("hex");
  oauthStateStore.set(state, {
    createdAt: Date.now(),
    tenantId: tenantId || null,
    redirectUri: redirectUri || null,
  });
  return state;
}

function validateOauthState(state) {
  const stored = oauthStateStore.get(state);
  if (!stored) {
    throw new Error("Invalid OAuth state");
  }
  oauthStateStore.delete(state);
  return stored;
}

function resolveRedirectUri(req, redirect) {
  if (!redirect || typeof redirect !== "string") return null;
  let requested;
  try {
    requested = new URL(redirect);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(requested.protocol)) return null;

  const originHeader = req.get("origin") || req.get("referer");
  if (originHeader) {
    try {
      const origin = new URL(originHeader).origin;
      if (origin === requested.origin) {
        return requested.toString();
      }
    } catch {
      return null;
    }
  }

  const allowlist = (process.env.META_OAUTH_REDIRECT_ALLOWLIST || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (allowlist.includes(requested.origin)) {
    return requested.toString();
  }

  return null;
}

function buildRedirectUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function fetchSheetRows({ tab }) {
  const response = await axios.post(
    CRM_SHEETS_READ_URL,
    { sheet_url: CRM_SHEETS_URL, tab_name: tab },
    {
      timeout: CRM_SHEETS_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 300,
    }
  );

  const raw = response.data;
  return Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.rows)
      ? raw.rows
      : Array.isArray(raw?.data)
        ? raw.data
        : [];
}

function normalizeSheetKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function mapSheetRowToLead(row) {
  if (!row || typeof row !== "object") return null;
  const normalized = {};
  Object.entries(row).forEach(([key, value]) => {
    normalized[normalizeSheetKey(key)] = value;
  });

  const fullName =
    normalized.full_name ||
    normalized.fullname ||
    normalized.nombre ||
    normalized.name ||
    normalized["full_name"] ||
    normalized["full name"];
  const email = normalized.email || normalized.mail;
  const phone = normalized.phone || normalized.telefono || normalized.telefono_celular;
  const leadId =
    normalized.meta_lead_id ||
    normalized.lead_id ||
    normalized.id ||
    normalized.leadid ||
    null;

  const leadStatus = String(normalized.lead_status || normalized.read_status || "").trim();
  let stage = "nuevo";
  if (leadStatus) {
    const status = leadStatus.toLowerCase();
    if (status.includes("convertido")) stage = "cerrado_venta";
    else if (status.includes("no")) stage = "cerrado_no_venta";
  }

  if (!fullName && !email && !phone) return null;

  return {
    leadId,
    fullName: fullName || "Sin nombre",
    email,
    phone,
    source: "sheet",
    stage,
  };
}

function signWebhookPayload(secret, timestamp, payload) {
  const base = `${timestamp}.${payload}`;
  return crypto.createHmac("sha256", secret).update(base).digest("hex");
}

async function emitStageWebhook({ lead, previousStage, nextStage, tenantId = null }) {
  if (!CRM_WEBHOOK_URL || !lead) return null;

  const event = {
    event: "lead_stage_changed",
    event_id: crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    tenant_id: tenantId,
    lead: {
      id: lead.id,
      meta_lead_id: lead.leadId || null,
      full_name: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
    },
    stage: {
      from: previousStage,
      to: nextStage,
    },
  };

  const payload = JSON.stringify(event);
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "codex-crm/1.0",
  };

  if (CRM_WEBHOOK_SECRET) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    headers["x-crm-timestamp"] = timestamp;
    headers["x-crm-signature"] = signWebhookPayload(CRM_WEBHOOK_SECRET, timestamp, payload);
  }

  try {
    const response = await axios.post(CRM_WEBHOOK_URL, payload, {
      headers,
      timeout: CRM_WEBHOOK_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    await addLeadEvent({
      leadId: lead.id,
      eventName: "webhook_lead_stage_changed",
      payload: { ok: true, status: response.status, data: response.data, event },
    });

    return { ok: true, status: response.status };
  } catch (err) {
    const errorPayload = err?.response?.data || err?.message || "Webhook failed";
    try {
      await addLeadEvent({
        leadId: lead.id,
        eventName: "webhook_lead_stage_changed",
        payload: { ok: false, error: errorPayload, event },
      });
    } catch (logErr) {
      console.error("Failed logging webhook event", logErr);
    }
    console.error("Webhook failed", errorPayload);
    return { ok: false, error: errorPayload };
  }
}

async function exchangeCodeForToken(code) {
  if (!META_APP_ID || !META_APP_SECRET || !META_REDIRECT_URI) {
    throw new Error("Missing Meta OAuth credentials");
  }

  const response = await axios.get(`${META_GRAPH_BASE}/oauth/access_token`, {
    params: {
      client_id: META_APP_ID,
      redirect_uri: META_REDIRECT_URI,
      client_secret: META_APP_SECRET,
      code,
    },
  });

  return response.data?.access_token;
}

async function fetchUserPages(userAccessToken) {
  const response = await axios.get(`${META_GRAPH_BASE}/me/accounts`, {
    params: {
      access_token: userAccessToken,
      fields: "id,name,access_token",
    },
  });

  return response.data?.data || [];
}

async function subscribePageToWebhook(pageId, pageAccessToken) {
  try {
    await axios.post(`${META_GRAPH_BASE}/${pageId}/subscribed_apps`, null, {
      params: {
        access_token: pageAccessToken,
        subscribed_fields: "leadgen",
      },
    });
  } catch (err) {
    console.error("Failed subscribing page", pageId, err?.response?.data || err.message);
  }
}

async function fetchLeadDetails(leadgenId, pageAccessToken) {
  const response = await axios.get(`${META_GRAPH_BASE}/${leadgenId}`, {
    params: {
      access_token: pageAccessToken,
      fields: "field_data,created_time,form_id,ad_id,adgroup_id,campaign_id",
    },
  });

  return response.data;
}

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
