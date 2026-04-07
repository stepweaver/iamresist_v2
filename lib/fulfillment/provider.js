/**
 * FulfillmentProvider - Abstract interface for print-on-demand fulfillment
 */

/**
 * @typedef {Object} ShippingAddress
 * @property {string} name - Recipient name
 * @property {string} line1 - Street address line 1
 * @property {string} [line2] - Street address line 2
 * @property {string} city - City
 * @property {string} state - State/Province
 * @property {string} postal_code - ZIP/Postal code
 * @property {string} country - 2-letter country code (e.g., 'US')
 */

/**
 * @typedef {Object} CreateOrderParams
 * @property {string} orderId - Internal order ID (for reference)
 * @property {ShippingAddress} shippingAddress - Where to ship
 * @property {string} productSku - Product identifier
 * @property {number} quantity - Number of items
 * @property {string} [customerEmail] - Customer email for notifications
 */

/**
 * @typedef {Object} CreateOrderResult
 * @property {string} externalOrderId - Provider's order ID
 * @property {string} status - Initial order status
 * @property {boolean} success - Whether order was created
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} OrderStatus
 * @property {string} status - 'pending' | 'in_production' | 'shipped' | 'delivered' | 'cancelled' | 'error'
 * @property {string} [trackingNumber] - Shipping tracking number
 * @property {string} [trackingUrl] - URL to track shipment
 * @property {string} [carrier] - Shipping carrier name
 */

export class FulfillmentProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
  }

  async createOrder(params) {
    throw new Error(`createOrder not implemented for ${this.name}`);
  }

  async getOrderStatus(externalOrderId) {
    throw new Error(`getOrderStatus not implemented for ${this.name}`);
  }

  async cancelOrder(externalOrderId) {
    throw new Error(`cancelOrder not implemented for ${this.name}`);
  }

  async parseWebhookPayload(payload) {
    throw new Error(`parseWebhookPayload not implemented for ${this.name}`);
  }
}

export const STATUS_MAP = {
  pending: 'pending',
  in_production: 'in_production',
  shipped: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  error: 'error',
  'on-hold': 'pending',
  'pending-payment': 'pending',
  'payment-not-received': 'error',
  'has-issues': 'error',
  printing: 'in_production',
  shipping: 'shipped',
  processing: 'in_production',
  complete: 'delivered',
};

export function normalizeStatus(providerStatus) {
  const normalized = STATUS_MAP[providerStatus?.toLowerCase()];
  return normalized || 'pending';
}
