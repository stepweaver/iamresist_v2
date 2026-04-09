import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

const dbMocks = vi.hoisted(() => ({
  getOrderByFulfillmentOrderId: vi.fn(),
  updateOrderByFulfillmentId: vi.fn(),
  markShipmentEmailSent: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  sendShippingNotification: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  env: {
    NODE_ENV: 'production',
    PRINTIFY_WEBHOOK_SECRET: 'whsec_test',
    ALLOW_UNSIGNED_PRINTIFY_WEBHOOKS: '',
  },
}));

vi.mock('@/lib/db', () => dbMocks);
vi.mock('@/lib/email', () => emailMocks);
vi.mock('@/lib/fulfillment/printify', () => ({
  PrintifyProvider: class {
    parseWebhookPayload(body) {
      return {
        orderId: body?.resource?.id,
        status: 'shipped',
        tracking: { trackingNumber: '1', trackingUrl: 'https://tracking.test' },
      };
    }
  },
}));

describe('printify webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getOrderByFulfillmentOrderId.mockResolvedValue({
      id: 'order_1',
      fulfillment_status: 'submitted',
      shipment_email_sent_at: null,
    });
    dbMocks.updateOrderByFulfillmentId.mockResolvedValue({
      id: 'order_1',
      shipment_email_sent_at: null,
    });
    dbMocks.markShipmentEmailSent.mockResolvedValue({ shipment_email_sent_at: '2026-03-22T00:00:00Z' });
    emailMocks.sendShippingNotification.mockResolvedValue({ success: true });
  });

  it('rejects missing signature', async () => {
    const { POST } = await import('@/app/api/webhooks/printify/route');
    const req = new Request('https://example.com/api/webhooks/printify', {
      method: 'POST',
      body: JSON.stringify({ type: 'order:updated', resource: { id: 'p_1' } }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 500 for transient local handler errors', async () => {
    const errLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      dbMocks.updateOrderByFulfillmentId.mockRejectedValue(new Error('db unavailable'));
      const { POST } = await import('@/app/api/webhooks/printify/route');
      const body = JSON.stringify({ type: 'order:updated', resource: { id: 'p_1' } });
      const sig = crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex');
      const req = new Request('https://example.com/api/webhooks/printify', {
        method: 'POST',
        body,
        headers: { 'x-pfy-signature': sig, 'content-type': 'application/json' },
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
    } finally {
      errLog.mockRestore();
    }
  });
});
