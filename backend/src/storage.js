const { v4: uuidv4 } = require("uuid");

const leads = new Map();
const leadEvents = [];

function createLead({ fullName, email, phone, source = "facebook" }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const lead = {
    id,
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

function listLeads() {
  return Array.from(leads.values());
}

function updateLeadStage(id, stage) {
  const lead = leads.get(id);
  if (!lead) return null;
  lead.stage = stage;
  lead.updatedAt = new Date().toISOString();
  return lead;
}

function addLeadEvent({ leadId, eventName, payload }) {
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

module.exports = {
  createLead,
  listLeads,
  updateLeadStage,
  addLeadEvent,
};
