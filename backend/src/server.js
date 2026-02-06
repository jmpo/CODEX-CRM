require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const crypto = require("crypto");

const { buildMetaPayload, sendMetaEvent } = require("./metaClient");
const { createLead, listLeads, updateLeadStage, addLeadEvent } = require("./storage");
const { mapStageToMetaEvent } = require("./stageMapping");
const { parseLeadPayload } = require("./facebookParser");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/webhooks/facebook", async (req, res) => {
  const payload = req.body;
  const leadData = parseLeadPayload(payload);
  const lead = createLead({ ...leadData, source: "facebook" });

  addLeadEvent({
    leadId: lead.id,
    eventName: "lead_ingested",
    payload,
  });

  res.json({ ok: true, lead });
});

app.get("/leads", (req, res) => {
  res.json({ data: listLeads() });
});

app.post("/leads", (req, res) => {
  const { fullName, email, phone } = req.body;
  if (!fullName) {
    return res.status(400).json({ error: "fullName is required" });
  }
  const lead = createLead({ fullName, email, phone, source: "manual" });
  res.status(201).json({ data: lead });
});

app.patch("/leads/:id", async (req, res) => {
  const { id } = req.params;
  const { stage } = req.body;
  if (!stage) {
    return res.status(400).json({ error: "stage is required" });
  }

  const lead = updateLeadStage(id, stage);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const eventName = mapStageToMetaEvent(stage);
  let metaResponse = null;

  if (eventName) {
    const eventId = crypto.randomUUID();
    const payload = buildMetaPayload({
      pixelId: process.env.META_PIXEL_ID,
      accessToken: process.env.META_ACCESS_TOKEN,
      eventName,
      eventTime: Math.floor(Date.now() / 1000),
      eventId,
      userData: {
        em: lead.email ? hashValue(lead.email) : undefined,
        ph: lead.phone ? hashValue(lead.phone) : undefined,
      },
      customData: {
        lead_id: lead.id,
        stage,
      },
      testEventCode: process.env.META_TEST_EVENT_CODE,
    });

    metaResponse = await sendMetaEvent(payload);

    addLeadEvent({
      leadId: lead.id,
      eventName: `meta_${eventName}`,
      payload: metaResponse,
    });
  }

  res.json({ data: lead, meta: metaResponse });
});

app.post("/events/meta", async (req, res) => {
  const { eventName, eventId, userData, customData } = req.body;
  if (!eventName || !eventId) {
    return res.status(400).json({ error: "eventName and eventId are required" });
  }

  const payload = buildMetaPayload({
    pixelId: process.env.META_PIXEL_ID,
    accessToken: process.env.META_ACCESS_TOKEN,
    eventName,
    eventTime: Math.floor(Date.now() / 1000),
    eventId,
    userData: userData || {},
    customData: customData || {},
    testEventCode: process.env.META_TEST_EVENT_CODE,
  });

  const metaResponse = await sendMetaEvent(payload);
  res.json({ ok: true, meta: metaResponse });
});

function hashValue(value) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
