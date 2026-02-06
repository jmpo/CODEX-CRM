function parseLeadPayload(payload) {
  const fields = payload.field_data || [];
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

module.exports = {
  parseLeadPayload,
};
