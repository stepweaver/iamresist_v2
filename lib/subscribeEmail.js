/**
 * [RESIST] Brief confirmation emails (Resend).
 */
import 'server-only';
import { env } from '@/lib/env';

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

export async function sendSubscribeConfirmationEmail({ toEmail, confirmUrl }) {
  const apiKey = typeof env.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY.trim() : '';
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set - skipping subscribe confirmation email');
    return { success: false, error: 'Email service not configured' };
  }

  const fromEmail = env.BRIEF_FROM_EMAIL;
  const fromName = env.BRIEF_FROM_NAME;

  const safeUrl = escapeHtml(confirmUrl);
  const html = `
    <!doctype html>
    <html>
      <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;line-height:1.6;color:#111;margin:0;padding:0;background:#f5f5f5;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:24px auto;background:#fff;">
          <tr>
            <td style="padding:24px 28px;border-bottom:3px solid #d32f2f;">
              <div style="font-weight:800;letter-spacing:0.12em;">I AM <span style="color:#d32f2f;">[RESIST]</span></div>
              <div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.2em;margin-top:6px;">[RESIST] Brief</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 14px 0;">Confirm your subscription to the [RESIST] Brief.</p>
              <p style="margin:0 0 14px 0;font-size:13px;color:#555;">
                The Brief is still a work in progress, and issues may arrive irregularly while production comes together.
              </p>
              <p style="margin:0 0 18px 0;font-size:13px;color:#555;">If you did not request this, you can ignore this email.</p>
              <p style="margin:0;">
                <a href="${safeUrl}" style="display:inline-block;background:#d32f2f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:700;">Confirm subscription</a>
              </p>
              <p style="margin:18px 0 0 0;font-size:12px;color:#666;word-break:break-all;">Or open: <a href="${safeUrl}" style="color:#d32f2f;">${safeUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background:#f9f9f9;border-top:1px solid #eee;font-size:12px;color:#666;text-align:center;">
              <div>Coming soon. Unsubscribe anytime.</div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = `Confirm your subscription to the [RESIST] Brief.\n\nThe Brief is still a work in progress, and issues may arrive irregularly while production comes together.\n\nConfirm: ${confirmUrl}\n\nIf you did not request this, you can ignore this email.\n`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [toEmail],
        subject: 'Confirm your subscription - [RESIST] Brief',
        html,
        text,
      }),
    });
    if (!response.ok) throw new Error(`Resend API error: ${await response.text()}`);
    const data = await response.json();
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('Failed to send subscribe confirmation email:', error);
    return { success: false, error: error.message };
  }
}
