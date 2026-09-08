// netlify/functions/send-sms.js
//
// Fires automatically when someone submits the "Get text updates" sign-up
// form in the site footer. Netlify sends the submission here, and this
// function texts a welcome message through Twilio -- but only if the person
// actually checked the consent box, so we never text someone who didn't
// agree to it.
 
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
 
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: 'Bad request' };
  }
 
  // Netlify sends the submitted fields either at the top level or nested
  // under "payload" -- handle both so this keeps working either way.
  const submission = body.payload || body;
  const data = submission.data || {};
 
  // Only act on the SMS sign-up form -- ignore any other forms on the site.
  const formName = submission.form_name || data['form-name'];
  if (formName !== 'sms-optin') {
    return { statusCode: 200, body: 'Ignored (not the sms-optin form)' };
  }
 
  const name = (data.name || '').trim();
  const phone = (data.phone || '').trim();
  const consent = data.consent; // only present/truthy if the box was checked
 
  if (!consent || !phone) {
    // No consent given, or no phone number -- do not text this person.
    return { statusCode: 200, body: 'Skipped (no consent or no phone number)' };
  }
 
  // Turn a US 10-digit number into the +1XXXXXXXXXX format Twilio expects.
  const digits = phone.replace(/\D/g, '');
  let toNumber;
  if (digits.length === 10) {
    toNumber = '+1' + digits;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    toNumber = '+' + digits;
  } else {
    return { statusCode: 200, body: 'Skipped (could not read phone number: ' + phone + ')' };
  }
 
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
 
  if (!accountSid || !authToken || !fromNumber) {
    console.error('Twilio environment variables are not set in Netlify.');
    return { statusCode: 500, body: 'Server not configured' };
  }
 
  const greeting = name ? `Hey ${name}, ` : 'Hey, ';
  const message =
    greeting +
    "thanks for signing up for text updates from Ricky James for Oceanside City Council! " +
    "We'll keep you posted on events, volunteer opportunities, and voting reminders. " +
    "Reply STOP to cancel, HELP for help. Msg & data rates may apply.";
 
  const params = new URLSearchParams();
  params.append('To', toNumber);
  params.append('From', fromNumber);
  params.append('Body', message);
 
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
 
  try {
    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
 
    if (!res.ok) {
      const errText = await res.text();
      console.error('Twilio error:', res.status, errText);
      return { statusCode: 502, body: 'Twilio send failed' };
    }
 
    return { statusCode: 200, body: 'Text sent' };
  } catch (err) {
    console.error('Error calling Twilio:', err);
    return { statusCode: 500, body: 'Error sending text' };
  }
};
 
