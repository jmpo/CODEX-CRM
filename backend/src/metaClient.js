const axios = require("axios");

const META_BASE_URL = "https://graph.facebook.com/v24.0";

function ensureArray(value) {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
}

function buildMetaPayload({
  datasetId,
  pixelId,
  accessToken,
  eventName,
  eventTime,
  eventId,
  userData,
  customData,
  testEventCode,
  eventSource,
  leadEventSource,
  actionSource = "system_generated",
}) {
  const id = datasetId || pixelId;
  if (!id) {
    throw new Error("Missing datasetId/pixelId for Meta Conversions API.");
  }

  const { em, ph, ...restUserData } = userData || {};
  const normalizedUserData = {
    ...restUserData,
    ...(em ? { em: ensureArray(em) } : {}),
    ...(ph ? { ph: ensureArray(ph) } : {}),
  };

  const normalizedCustomData = {
    ...customData,
    ...(eventSource ? { event_source: eventSource } : {}),
    ...(leadEventSource ? { lead_event_source: leadEventSource } : {}),
  };

  return {
    url: `${META_BASE_URL}/${id}/events?access_token=${accessToken}`,
    data: {
      data: [
        {
          event_name: eventName,
          event_time: eventTime,
          event_id: eventId,
          action_source: actionSource,
          user_data: normalizedUserData,
          custom_data: normalizedCustomData,
        },
      ],
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
    },
  };
}

async function sendMetaEvent(payload) {
  const { url, data } = payload;
  const response = await axios.post(url, data, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  return response.data;
}

module.exports = {
  buildMetaPayload,
  sendMetaEvent,
};
