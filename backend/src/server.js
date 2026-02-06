require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const crypto = require("crypto");
const cors = require("cors");
const axios = require("axios");

const { buildMetaPayload, sendMetaEvent } = require("./metaClient");
const {
  createLead,
  listLeads,
  findLeadByMetaId,
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
  process.env.META_APP_SCOPES || "pages_read_engagement,leads_retrieval,pages_manage_metadata";

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

  const state = createOauthState(req.query?.tenant);
  const url = `${META_OAUTH_BASE}?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(
    META_REDIRECT_URI
  )}&state=${state}&scope=${encodeURIComponent(META_APP_SCOPES)}`;

  return res.redirect(url);
});

app.get("/auth/meta/callback", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  if (error) {
    return res.status(400).json({ error, errorDescription });
  }
  if (!code || !state) {
    return res.status(400).json({ error: "Missing code/state" });
  }

  try {
    const tenantId = validateOauthState(String(state));
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

    res.json({ ok: true, pages: stored.length, stored });
  } catch (err) {
    handleServerError(res, err);
  }
});

app.get("/auth/meta/pages", async (req, res) => {
  try {
    const pages = await listFacebookPages();
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
    const lead = await updateLeadStage(id, stage);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

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

    res.json({ data: lead, meta: metaResponse });
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

function createOauthState(tenantId) {
  const raw = crypto.randomBytes(16).toString("hex");
  const state = tenantId ? `${raw}:${tenantId}` : raw;
  oauthStateStore.set(state, Date.now());
  return state;
}

function validateOauthState(state) {
  const createdAt = oauthStateStore.get(state);
  if (!createdAt) {
    throw new Error("Invalid OAuth state");
  }
  oauthStateStore.delete(state);
  const parts = state.split(":");
  return parts.length > 1 ? parts.slice(1).join(":") : null;
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
