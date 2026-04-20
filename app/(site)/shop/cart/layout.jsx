import { buildPageMetadata } from '@/lib/metadata';

export const metadata = {
  ...buildPageMetadata({
    title: 'Shopping Cart',
    description: 'Review sticker selections and checkout details before placing an order.',
    urlPath: '/shop/cart',
  }),
  robots: {
    index: false,
    follow: false,
  },
};

export default function CartLayout({ children }) {
  return children;
}
