/**
 * PrintifyProvider - Printify print-on-demand fulfillment
 * API: https://developers.printify.com/
 */

import "server-only";
import { FulfillmentProvider, normalizeStatus } from './provider.js';
import { env } from '@/lib/env';
import { MAX_LINE_ITEM_QUANTITY } from '@/lib/constants/shopLimits';

const PRINTIFY_API_BASE = 'https://api.printify.com/v1';

function extractShopId(shopIdOrUrl) {
  if (!shopIdOrUrl) return null;
  if (/^\d+$/.test(shopIdOrUrl.trim())) return shopIdOrUrl.trim();
  const match = shopIdOrUrl.match(/\/store\/(\d+)/);
  return match ? match[1] : shopIdOrUrl.trim();
}

function assertLineQuantity(q, label) {
  if (!Number.isInteger(q) || q < 1 || q > MAX_LINE_ITEM_QUANTITY) {
    throw new Error(`${label}: quantity must be an integer from 1 to ${MAX_LINE_ITEM_QUANTITY}`);
  }
}

function toProviderError(error) {
  return {
    message: error?.message || 'Printify request failed',
    status: error?.status ?? null,
    responseBody: error?.responseBody ?? null,
    retryable: error?.retryable === true,
  };
}

export class PrintifyProvider extends FulfillmentProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'printify';
    this.apiToken = (config.apiToken || env.PRINTIFY_API_TOKEN || '').trim();
    const rawShopId = config.shopId || env.PRINTIFY_SHOP_ID;
    this.shopId = extractShopId(rawShopId);
    if (!this.apiToken) console.warn('PrintifyProvider: PRINTIFY_API_TOKEN not configured');
    if (!this.shopId) console.warn('PrintifyProvider: PRINTIFY_SHOP_ID not configured');
  }

  async request(endpoint, options = {}) {
    const url = `${PRINTIFY_API_BASE}${endpoint}`;
    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'I-AM-RESIST-Shop/1.0',
          ...options.headers,
        },
      });
    } catch (e) {
      const err = new Error(e?.message || 'Printify network error');
      err.retryable = true;
      err.cause = e;
      throw err;
    }
    const errorText = await response.text();
    if (!response.ok) {
      const err = new Error(`Printify API error (${response.status}): ${errorText}`);
      err.status = response.status;
      err.responseBody = errorText;
      err.retryable = response.status === 429 || response.status >= 500;
      throw err;
    }
    return errorText ? JSON.parse(errorText) : null;
  }

  async retryOperation(operation, maxRetries = 3, initialDelay = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const retry = error.retryable === true;
        if (!retry) throw error;
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  /**
   * Create a Printify order (single-item XOR cart mode).
   * @param {Object} options
   * @param {string} options.orderId
   * @param {Object} options.shippingAddress
   * @param {string} options.customerEmail
   * @param {string} [options.productSku] - Single mode: Printify blueprint product id
   * @param {number} [options.quantity] - Single mode
   * @param {Array<{printifyProductId: string, quantity: number}>} [options.lineItems] - Cart mode
   */
  async createOrder({ orderId, shippingAddress, productSku, quantity, customerEmail, lineItems }) {
    const hasLineItems = Array.isArray(lineItems) && lineItems.length > 0;
    const hasSingle = productSku != null && String(productSku).length > 0;

    if (hasLineItems && hasSingle) {
      throw new Error('createOrder: pass either lineItems or productSku, not both');
    }
    if (!hasLineItems && !hasSingle) {
      throw new Error('createOrder: lineItems or productSku is required');
    }

    try {
      let printifyLineItems = [];

      if (hasLineItems) {
        for (const item of lineItems) {
          assertLineQuantity(item.quantity, `lineItems[${item.printifyProductId}]`);
          const product = await this.getProduct(item.printifyProductId);
          if (!product) {
            return { success: false, error: `Product not found: ${item.printifyProductId}`, externalOrderId: null, status: 'error' };
          }
          const variant = product.variants?.find((v) => v.is_enabled);
          if (!variant) {
            return { success: false, error: `No enabled variants for product ${item.printifyProductId}`, externalOrderId: null, status: 'error' };
          }
          printifyLineItems.push({
            product_id: item.printifyProductId,
            variant_id: variant.id,
            quantity: item.quantity,
          });
        }
      } else {
        const q = quantity ?? 1;
        assertLineQuantity(q, 'quantity');
        const product = await this.getProduct(productSku);
        if (!product) {
          return { success: false, error: `Product not found: ${productSku}`, externalOrderId: null, status: 'error' };
        }
        const variant = product.variants?.find((v) => v.is_enabled);
        if (!variant) {
          return { success: false, error: 'No enabled variants found for product', externalOrderId: null, status: 'error' };
        }
        printifyLineItems = [{ product_id: productSku, variant_id: variant.id, quantity: q }];
      }

      const orderPayload = {
        external_id: orderId,
        label: `Order ${orderId}`,
        line_items: printifyLineItems,
        shipping_method: 1,
        send_shipping_notification: true,
        address_to: {
          first_name: this.extractFirstName(shippingAddress?.name),
          last_name: this.extractLastName(shippingAddress?.name),
          email: customerEmail || '',
          phone: '',
          country: shippingAddress?.country || 'US',
          region: shippingAddress?.state || '',
          address1: shippingAddress?.line1 || '',
          address2: shippingAddress?.line2 || '',
          city: shippingAddress?.city || '',
          zip: shippingAddress?.postal_code || '',
        },
      };
      const result = await this.retryOperation(() =>
        this.request(`/shops/${this.shopId}/orders.json`, { method: 'POST', body: JSON.stringify(orderPayload) })
      );
      const printifyOrderId = String(result.id);
      try {
        await this.retryOperation(() => this.sendToProduction(printifyOrderId));
      } catch (prodErr) {
        console.error('Printify sendToProduction failed after order create:', prodErr);
        return {
          success: false,
          partial: true,
          externalOrderId: printifyOrderId,
          error: prodErr.message,
          providerError: toProviderError(prodErr),
          status: 'error',
          productionFailed: true,
        };
      }
      return { success: true, externalOrderId: printifyOrderId, status: normalizeStatus(result.status) };
    } catch (error) {
      console.error('Printify createOrder error:', error);
      return {
        success: false,
        error: error.message,
        providerError: toProviderError(error),
        externalOrderId: null,
        status: 'error',
      };
    }
  }

  async sendToProduction(printifyOrderId) {
    return this.request(`/shops/${this.shopId}/orders/${printifyOrderId}/send_to_production.json`, { method: 'POST' });
  }

  /**
   * Retry production submit when order already exists at Printify (partial success recovery).
   */
  async retrySendToProduction(printifyOrderId) {
    try {
      await this.retryOperation(() => this.sendToProduction(printifyOrderId));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message, providerError: toProviderError(error) };
    }
  }

  async findOrderByExternalId(externalId, limit = 50) {
    if (!externalId) return null;
    const orders = await this.request(`/shops/${this.shopId}/orders.json?page=1&limit=${limit}`);
    if (!Array.isArray(orders)) return null;
    const match = orders.find((o) => String(o.external_id || '') === String(externalId));
    return match ? String(match.id) : null;
  }

  async getProduct(productId) {
    try {
      return await this.request(`/shops/${this.shopId}/products/${productId}.json`);
    } catch (error) {
      console.error('Error fetching product:', error);
      return null;
    }
  }

  async getOrderStatus(externalOrderId) {
    try {
      const order = await this.request(`/shops/${this.shopId}/orders/${externalOrderId}.json`);
      return {
        status: normalizeStatus(order.status),
        trackingNumber: order.shipments?.[0]?.tracking_number || null,
        trackingUrl: order.shipments?.[0]?.url || null,
        carrier: order.shipments?.[0]?.carrier || null,
      };
    } catch (error) {
      console.error('Printify getOrderStatus error:', error);
      return { status: 'error', trackingNumber: null, trackingUrl: null };
    }
  }

  async cancelOrder(externalOrderId) {
    try {
      await this.request(`/shops/${this.shopId}/orders/${externalOrderId}/cancel.json`, { method: 'POST' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async parseWebhookPayload(payload) {
    const { resource } = payload;
    return {
      orderId: resource?.id,
      externalId: resource?.external_id,
      status: normalizeStatus(resource?.status),
      tracking: resource?.shipments?.[0]
        ? {
            trackingNumber: resource.shipments[0].tracking_number,
            trackingUrl: resource.shipments[0].url,
            carrier: resource.shipments[0].carrier,
          }
        : null,
    };
  }

  extractFirstName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    return parts[0] || '';
  }

  extractLastName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    return parts.slice(1).join(' ') || parts[0] || '';
  }
}
