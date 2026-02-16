const stageToEvent = {
  nuevo: "Lead",
  contactado: "Contact",
  cualificado: "QualifiedLead",
  cerrado_venta: "Purchase",
  cerrado_no_venta: "LeadDisqualified",
};

function mapStageToMetaEvent(stage) {
  return stageToEvent[stage] || null;
}

module.exports = {
  mapStageToMetaEvent,
};
