function parseLeadFields(fields = []) {
  const getValue = (name) => {
    const item = fields.find((field) => field.name === name);
    return item?.values?.[0] || null;
  };

  return {
    fullName: getValue("full_name") || getValue("nombre") || "Sin nombre",
    email: getValue("email"),
    phone: getValue("phone_number") || getValue("phone"),
  };
}

function parseLeadPayload(payload) {
  const fields = payload.field_data || [];
  return parseLeadFields(fields);
}

function extractLeadgenInfo(payload) {
  if (!payload?.entry || !Array.isArray(payload.entry)) return null;

  for (const entry of payload.entry) {
    const pageId = entry.id || null;
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== "leadgen") continue;
      const value = change.value || {};
      const leadgenId = value.leadgen_id || value.lead_id;
      if (!leadgenId) continue;
      return {
        leadgenId,
        pageId: value.page_id || pageId,
        formId: value.form_id || null,
        createdTime: value.created_time || null,
      };
    }
  }

  return null;
}

module.exports = {
  parseLeadPayload,
  parseLeadFields,
  extractLeadgenInfo,
};
