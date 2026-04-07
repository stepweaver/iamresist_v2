/**
 * GET /api/orders/[id]
 * Full order details only with valid signed token (query or Authorization: Bearer).
 */

import { NextResponse } from 'next/server';
import { getOrderById } from '@/lib/db';
import { PrintifyProvider } from '@/lib/fulfillment/printify';
import { verifyOrderStatusToken } from '@/lib/orderStatusToken';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  let token = searchParams.get('token');
  const auth = request.headers.get('authorization');
  if (!token && auth?.startsWith('Bearer ')) {
    token = auth.slice(7).trim();
  }

  if (!id) {
    return NextResponse.json({ error: 'Order ID required' }, { status: 400, headers: noStore });
  }

  if (!verifyOrderStatusToken(id, token)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore });
  }

  try {
    const order = await getOrderById(id);
    if (!order) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore });
    }

    let liveStatus = null;
    if (order.fulfillment_order_id && order.fulfillment_provider === 'printify') {
      try {
        const printify = new PrintifyProvider();
        liveStatus = await printify.getOrderStatus(order.fulfillment_order_id);
      } catch (error) {
        console.error('Failed to fetch live status:', error);
      }
    }

    return NextResponse.json(
      {
        order: {
          id: order.id,
          status: order.fulfillment_status,
          trackingNumber: order.tracking_number,
          trackingUrl: order.tracking_url,
          createdAt: order.created_at,
          updatedAt: order.updated_at,
          customerEmail: order.customer_email,
          shippingName: order.shipping_name,
          shippingAddress: {
            line1: order.shipping_address_line1,
            line2: order.shipping_address_line2,
            city: order.shipping_city,
            state: order.shipping_state,
            postalCode: order.shipping_postal_code,
            country: order.shipping_country,
          },
          productSku: order.product_sku,
          quantity: order.quantity,
          amountTotal: order.amount_total,
          lineItems: order.line_items,
        },
        liveStatus,
      },
      { headers: noStore }
    );
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500, headers: noStore }
    );
  }
}
