function createAdaptiveCardPayload(text) {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.2',
          body: [{ type: 'TextBlock', text, wrap: true }],
        },
      },
    ],
  };
}

async function sendToTeams(webhookUrl, text) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createAdaptiveCardPayload(text)),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Envoi Teams échoué (${res.status}) : ${body.slice(0, 300)}`);
  }
}

module.exports = { createAdaptiveCardPayload, sendToTeams };
