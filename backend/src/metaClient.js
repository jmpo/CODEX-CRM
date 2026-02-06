const axios = require("axios");

const META_BASE_URL = "https://graph.facebook.com/v19.0";

function buildMetaPayload({
  pixelId,
  accessToken,
  eventName,
  eventTime,
  eventId,
  userData,
  customData,
  testEventCode,
}) {
  return {
    url: `${META_BASE_URL}/${pixelId}/events?access_token=${accessToken}`,
    data: {
      data: [
        {
          event_name: eventName,
          event_time: eventTime,
          event_id: eventId,
          action_source: "system_generated",
          user_data: userData,
          custom_data: customData,
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
