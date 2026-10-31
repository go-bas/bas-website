// Notifies Robert by email through Resend, the same provider YPS uses.
// Needs RESEND_API_KEY and BAS_NOTIFY_EMAIL; EMAIL_FROM is optional.
const DEFAULT_FROM = 'Business Automated Systems <noreply@yourpersonalstories.com>';

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.BAS_NOTIFY_EMAIL);
}

export async function notify(subject, lines) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: process.env.BAS_NOTIFY_EMAIL.split(',').map((a) => a.trim()),
      subject,
      text: lines.filter(Boolean).join('\n'),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Email: HTTP ${res.status}`);
}
