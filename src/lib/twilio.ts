import twilio from 'twilio';

export async function sendLeadSMS(
  to: string,
  clientName: string,
  firstName: string,
  lastName: string,
  phone: string | null,
  sourceAdName: string | null,
) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log('[twilio] Missing Twilio credentials, skipping SMS');
    return;
  }

  const client = twilio(accountSid, authToken);
  const body = `New lead for ${clientName}: ${firstName} ${lastName} — ${phone ?? 'No phone'} — from ad "${sourceAdName ?? 'Unknown'}". View in North Star Ventures CRM.`;

  try {
    await client.messages.create({ body, from: fromNumber, to });
    console.log(`[twilio] SMS sent to ${to}`);
  } catch (err) {
    console.error('[twilio] Failed to send SMS:', err);
  }
}
