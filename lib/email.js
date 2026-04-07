/**
 * Email service for order confirmations and shipping notifications (Resend).
 * Set RESEND_API_KEY. Optional: ORDER_FROM_EMAIL, ORDER_FROM_NAME.
 */

import "server-only";
import { env } from '@/lib/env';
import { signOrderStatusToken, buildOrderStatusUrl } from '@/lib/orderStatusToken';

const RESEND_API_KEY = env.RESEND_API_KEY;

function getOrderStatusLink(order) {
  try {
    const token = signOrderStatusToken(order.id);
    return buildOrderStatusUrl(order.id, token);
  } catch (e) {
    console.warn('Order status link: using shop fallback —', e.message);
    return `${env.BASE_URL.replace(/\/$/, '')}/shop`;
  }
}
const FROM_EMAIL = env.ORDER_FROM_EMAIL;
const FROM_NAME = env.ORDER_FROM_NAME;

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

export async function sendOrderConfirmation(order, productInfo) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set - skipping order confirmation email');
    return { success: false, error: 'Email service not configured' };
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [order.customer_email],
        subject: `Order Confirmation - ${order.id.slice(0, 8).toUpperCase()}`,
        html: generateOrderConfirmationHTML(order, productInfo),
        text: generateOrderConfirmationText(order, productInfo),
      }),
    });
    if (!response.ok) throw new Error(`Resend API error: ${await response.text()}`);
    const data = await response.json();
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('Failed to send order confirmation email:', error);
    return { success: false, error: error.message };
  }
}

export async function sendShippingNotification(order) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set - skipping shipping notification');
    return { success: false, error: 'Email service not configured' };
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [order.customer_email],
        subject: `Your Order Has Shipped - ${order.id.slice(0, 8).toUpperCase()}`,
        html: generateShippingNotificationHTML(order),
        text: generateShippingNotificationText(order),
      }),
    });
    if (!response.ok) throw new Error(`Resend API error: ${await response.text()}`);
    const data = await response.json();
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('Failed to send shipping notification:', error);
    return { success: false, error: error.message };
  }
}

function generateOrderConfirmationHTML(order, productInfo) {
  const orderTotal = (order.amount_total / 100).toFixed(2);
  const baseUrl = env.BASE_URL.replace(/\/$/, '');
  const trackUrl = getOrderStatusLink(order);
  const stickerImageUrl = `${baseUrl}/resist_sticker.png`;
  const lineItems = productInfo?.lineItems;
  const orderDetailsBlock = lineItems?.length
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr><td style="padding: 8px 0; font-weight: bold; width: 140px;">Order ID:</td><td style="padding: 8px 0; font-family: monospace;">${order.id.slice(0, 8).toUpperCase()}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: bold;">Items:</td><td style="padding: 8px 0;"></td></tr>
        ${lineItems.map((i) => `<tr><td style="padding: 4px 0 4px 20px; color: #666;">${escapeHtml(i.name)} × ${i.quantity}</td><td></td></tr>`).join('')}
        <tr><td style="padding: 8px 0; font-weight: bold; font-size: 18px;">Total:</td><td style="padding: 8px 0; font-size: 18px; color: #d32f2f; font-weight: bold;">$${orderTotal}</td></tr>
      </table>`
    : `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr><td style="padding: 8px 0; font-weight: bold; width: 140px;">Order ID:</td><td style="padding: 8px 0; font-family: monospace;">${order.id.slice(0, 8).toUpperCase()}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: bold;">Product:</td><td style="padding: 8px 0;">${productInfo?.name || 'I AM [RESIST] Vinyl Sticker'}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: bold;">Quantity:</td><td style="padding: 8px 0;">${order.quantity} ${order.quantity === 1 ? 'sticker' : 'stickers'}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: bold; font-size: 18px;">Total:</td><td style="padding: 8px 0; font-size: 18px; color: #d32f2f; font-weight: bold;">$${orderTotal}</td></tr>
      </table>`;
  const shippingBlock =
    order.shipping_name &&
    `
    <tr><td style="padding: 0 30px 20px;">
      <div style="background: #f9f9f9; padding: 25px; border-radius: 8px; border-left: 4px solid #d32f2f;">
        <h2 style="margin: 0 0 15px 0; color: #d32f2f; font-size: 20px;">Shipping Address</h2>
        <p style="margin: 0; color: #666; line-height: 1.8;">
          ${escapeHtml(order.shipping_name)}<br>
          ${escapeHtml(order.shipping_address_line1)}<br>
          ${order.shipping_address_line2 ? escapeHtml(order.shipping_address_line2) + '<br>' : ''}
          ${escapeHtml(order.shipping_city)}, ${escapeHtml(order.shipping_state)} ${escapeHtml(order.shipping_postal_code)}<br>
          ${escapeHtml(order.shipping_country)}
        </p>
      </div>
    </td></tr>`;
  return `
    <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Order Confirmation</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f5f5f5;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; margin: 20px auto; max-width: 600px;">
        <tr><td style="padding: 30px; text-align: center; border-bottom: 3px solid #d32f2f;"><h1 style="color: #d32f2f; margin: 0 0 10px 0; font-size: 28px;">I AM [RESIST]</h1><p style="margin: 0; font-size: 14px; color: #666; text-transform: uppercase;">Order Confirmation</p></td></tr>
        <tr><td style="padding: 30px 30px 20px;"><p style="margin: 0 0 20px 0; font-size: 16px;">Thank you for your order! We've received your payment and your order is being processed.</p></td></tr>
        <tr><td style="padding: 0 30px 20px; text-align: center;"><img src="${stickerImageUrl}" alt="I AM [RESIST] Vinyl Sticker" style="max-width: 300px; width: 100%; height: auto; border-radius: 8px;" /></td></tr>
        <tr><td style="padding: 0 30px 20px;">
          <div style="background: #f9f9f9; padding: 25px; border-radius: 8px; border-left: 4px solid #d32f2f;">
            <h2 style="margin: 0 0 15px 0; color: #d32f2f; font-size: 20px;">Order Details</h2>
            ${orderDetailsBlock}
          </div>
        </td></tr>
        ${shippingBlock || ''}
        <tr><td style="padding: 0 30px 30px;"><div style="background: #fff3e0; padding: 20px; border-radius: 8px;"><p style="margin: 0 0 10px 0; font-weight: bold; color: #e65100;">Shipping</p><p style="margin: 0; color: #666; font-size: 14px;">Your order will be processed and shipped within 3-5 business days. You'll receive a tracking email once it ships.</p></div></td></tr>
        <tr><td style="padding: 0 30px 20px; text-align: center;"><a href="${escapeHtml(trackUrl)}" style="display: inline-block; padding: 12px 30px; background-color: #d32f2f; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Track Your Order</a></td></tr>
        <tr><td style="padding: 30px; background-color: #f9f9f9; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center;"><p style="margin: 0 0 10px 0;">Questions? <a href="mailto:support@iamresist.org" style="color: #d32f2f;">support@iamresist.org</a></p><p style="margin: 20px 0 0 0; font-weight: bold; color: #d32f2f;">I AM [RESIST]</p></td></tr>
      </table>
    </body></html>`;
}

function generateOrderConfirmationText(order, productInfo) {
  const orderTotal = (order.amount_total / 100).toFixed(2);
  const trackUrl = getOrderStatusLink(order);
  const lineItems = productInfo?.lineItems;
  const itemsText = lineItems?.length
    ? lineItems.map((i) => `  - ${i.name} × ${i.quantity}`).join('\n')
    : `Product: ${productInfo?.name || 'I AM [RESIST] Vinyl Sticker'}\nQuantity: ${order.quantity}`;
  let text = `I AM [RESIST] - Order Confirmation\n\nThank you for your order! We've received your payment.\n\nOrder ID: ${order.id.slice(0, 8).toUpperCase()}\n${itemsText}\nTotal: $${orderTotal}\n\n`;
  if (order.shipping_name) {
    text += `Shipping: ${order.shipping_name}, ${order.shipping_address_line1}, ${order.shipping_city}, ${order.shipping_state} ${order.shipping_postal_code}, ${order.shipping_country}\n\n`;
  }
  text += `Track your order: ${trackUrl}\n\nQuestions? support@iamresist.org\nI AM [RESIST]`;
  return text;
}

function generateShippingNotificationHTML(order) {
  const baseUrl = env.BASE_URL;
  const trackingBlock =
    order.tracking_number &&
    `
      <div style="background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <h2 style="margin-top: 0; color: #d32f2f;">Tracking Information</h2>
        <p><strong>Tracking Number:</strong> ${escapeHtml(order.tracking_number)}</p>
        ${order.tracking_url ? `<p><a href="${escapeHtml(order.tracking_url)}" style="color: #d32f2f;">Track Your Package →</a></p>` : ''}
      </div>`;
  return `
    <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your Order Has Shipped</title></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="border-bottom: 3px solid #d32f2f; padding-bottom: 20px;"><h1 style="color: #d32f2f; margin: 0;">I AM [RESIST]</h1><p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Your Order Has Shipped</p></div>
      <p>Great news! Your order has shipped and is on its way to you.</p>
      ${trackingBlock || ''}
      <p><a href="${escapeHtml(trackUrl)}" style="color: #d32f2f;">Track your order</a></p>
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;"><p>Questions? <a href="mailto:support@iamresist.org" style="color: #d32f2f;">support@iamresist.org</a></p><p style="margin-top: 20px; font-weight: bold; color: #d32f2f;">I AM [RESIST]</p></div>
    </body></html>`;
}

function generateShippingNotificationText(order) {
  const trackUrl = getOrderStatusLink(order);
  let text = `I AM [RESIST] - Your Order Has Shipped\n\nGreat news! Your order has shipped.\n\n`;
  if (order.tracking_number) text += `Tracking: ${order.tracking_number}\n${order.tracking_url ? `Track: ${order.tracking_url}\n` : ''}\n`;
  text += `Track order: ${trackUrl}\n\nQuestions? support@iamresist.org\nI AM [RESIST]`;
  return text;
}
