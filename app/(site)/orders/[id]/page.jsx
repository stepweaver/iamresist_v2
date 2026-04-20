import Link from 'next/link';
import { getOrderById } from '@/lib/db';
import { getProductDisplayName } from '@/lib/stripe';
import { formatDate } from '@/lib/utils/date';
import PageLayout from '@/components/PageLayout';
import Card from '@/components/Card';
import SectionDivider from '@/components/SectionDivider';
import { buildPageMetadata } from '@/lib/metadata';
import { verifyOrderStatusToken } from '@/lib/orderStatusToken';

export async function generateMetadata({ params }) {
  const { id } = await params;

  return {
    ...buildPageMetadata({
      title: 'Order Status',
      description: 'Secure order lookup and shipping status for an existing purchase.',
      urlPath: `/orders/${encodeURIComponent(id)}`,
    }),
    robots: {
      index: false,
      follow: false,
    },
  };
}

function getStatusDisplay(status) {
  const statusMap = {
    pending: {
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/20',
      label: 'Pending',
      description: 'Your order is being processed',
    },
    fulfillment_failed: {
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/20',
      label: 'Processing issue',
      description: 'We are retrying fulfillment; contact support if this persists',
    },
    submitted: {
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/20',
      label: 'In Production',
      description: 'Your order is being printed',
    },
    in_production: {
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/20',
      label: 'In Production',
      description: 'Your order is being printed',
    },
    shipped: {
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/20',
      label: 'Shipped',
      description: 'Your order is on its way',
    },
    delivered: {
      color: 'text-green-500',
      bgColor: 'bg-green-500/20',
      label: 'Delivered',
      description: 'Your order has been delivered',
    },
    error: {
      color: 'text-red-500',
      bgColor: 'bg-red-500/20',
      label: 'Error',
      description: 'There was an issue with your order',
    },
    cancelled: {
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/20',
      label: 'Cancelled',
      description: 'Your order was cancelled',
    },
  };
  return statusMap[status] || statusMap.pending;
}

export default async function OrderStatusPage({ params, searchParams }) {
  const { id } = await params;
  const sp = searchParams instanceof Promise ? await searchParams : searchParams;
  const token = typeof sp?.token === 'string' ? sp.token : null;

  if (!verifyOrderStatusToken(id, token)) {
    return (
      <PageLayout>
        <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-12 sm:py-16">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-4">Order Not Found</h1>
            <p className="text-foreground/70 mb-6">
              Use the secure link from your order confirmation email to view this page.
            </p>
            <Link
              href="/shop"
              className="inline-block px-6 py-3 bg-primary hover:bg-primary-dark border border-primary font-bold text-sm tracking-wider uppercase transition-all duration-200"
            >
              Back to Shop
            </Link>
          </Card>
        </div>
      </PageLayout>
    );
  }

  let order = null;
  let error = null;

  try {
    order = await getOrderById(id);
  } catch (err) {
    console.error('Error fetching order:', err);
    error = 'Failed to load order information';
  }

  if (error || !order) {
    return (
      <PageLayout>
        <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-12 sm:py-16">
          <Card className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-4">Order Not Found</h1>
            <p className="text-foreground/70 mb-6">
              {error || "We couldn't find an order with that ID."}
            </p>
            <Link
              href="/shop"
              className="inline-block px-6 py-3 bg-primary hover:bg-primary-dark border border-primary font-bold text-sm tracking-wider uppercase transition-all duration-200"
            >
              Back to Shop
            </Link>
          </Card>
        </div>
      </PageLayout>
    );
  }

  const statusDisplay = getStatusDisplay(order.fulfillment_status || 'pending');
  const orderTotal = (order.amount_total / 100).toFixed(2);
  const orderDate = formatDate(order.created_at);
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];

  return (
    <PageLayout>
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-4">
        <nav className="text-xs text-foreground/60 uppercase tracking-wider">
          <Link href="/" className="hover:text-primary transition-colors">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/shop" className="hover:text-primary transition-colors">
            Shop
          </Link>
          <span className="mx-2">/</span>
          <span className="text-primary">Order Status</span>
        </nav>
      </div>

      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold uppercase tracking-wider mb-2">
              Order Status
            </h1>
            <p className="text-foreground/60">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </p>
          </div>

          <SectionDivider />

          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div
                className={`w-16 h-16 rounded-full ${statusDisplay.bgColor} flex items-center justify-center flex-shrink-0 ${statusDisplay.color} text-2xl font-bold`}
                aria-hidden
              >
                •
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-1">{statusDisplay.label}</h2>
                <p className="text-foreground/70 text-sm">
                  {statusDisplay.description}
                </p>
                {order.fulfillment_status === 'shipped' &&
                  order.tracking_number && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-sm font-semibold mb-2">
                        Tracking Information
                      </p>
                      <p className="text-sm text-foreground/70 mb-2">
                        Tracking Number:{' '}
                        <span className="font-mono">
                          {order.tracking_number}
                        </span>
                      </p>
                      {order.tracking_url && (
                        <a
                          href={order.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block px-4 py-2 bg-primary hover:bg-primary-dark text-sm font-bold uppercase tracking-wider transition-all duration-200"
                        >
                          Track Package →
                        </a>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold uppercase tracking-wider mb-4">
              Order Details
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-foreground/70">Order Date</span>
                <span className="font-medium">{orderDate}</span>
              </div>
              {lineItems.length > 0 ? (
                <div className="space-y-2 text-sm">
                  <span className="text-foreground/70">Items</span>
                  <ul className="list-disc pl-5 space-y-1">
                    {lineItems.map((row, idx) => (
                      <li key={`${row.sku}-${row.slug}-${idx}`}>
                        {row.product_name || row.sku} × {row.quantity}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground/70">Product</span>
                    <span className="font-medium">{getProductDisplayName(order.product_sku)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground/70">Quantity</span>
                    <span className="font-medium">{order.quantity}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm pt-3 border-t border-border">
                <span className="font-bold">Total</span>
                <span className="font-bold text-primary text-lg">
                  ${orderTotal}
                </span>
              </div>
            </div>
          </Card>

          {order.shipping_name && (
            <Card className="p-6">
              <h2 className="text-lg font-bold uppercase tracking-wider mb-4">
                Shipping Address
              </h2>
              <div className="text-sm space-y-1">
                <p className="font-medium">{order.shipping_name}</p>
                <p>{order.shipping_address_line1}</p>
                {order.shipping_address_line2 && (
                  <p>{order.shipping_address_line2}</p>
                )}
                <p>
                  {order.shipping_city}, {order.shipping_state}{' '}
                  {order.shipping_postal_code}
                </p>
                <p>{order.shipping_country}</p>
              </div>
            </Card>
          )}

          <Card className="p-6 border-primary/30">
            <h2 className="text-lg font-bold uppercase tracking-wider mb-4">
              Need Help?
            </h2>
            <p className="text-sm text-foreground/70 mb-4">
              If you have questions about your order or need assistance, please
              contact us.
            </p>
            <a
              href="mailto:support@iamresist.org"
              className="inline-block px-6 py-3 border border-primary hover:bg-primary hover:text-background font-bold text-sm tracking-wider uppercase transition-all duration-200"
            >
              Contact Support
            </a>
          </Card>

          <div className="text-center">
            <Link
              href="/shop"
              className="inline-block text-sm text-foreground/60 hover:text-primary transition-colors uppercase tracking-wider font-bold"
            >
              ← Back to Shop
            </Link>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
