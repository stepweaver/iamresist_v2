/**
 * GET /api/printify/list-products — list Printify products (non-production only).
 */

import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function notFoundInProd() {
  if (env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}

function extractShopId(shopIdOrUrl) {
  if (!shopIdOrUrl) return null;
  if (/^\d+$/.test(shopIdOrUrl.trim())) {
    return shopIdOrUrl.trim();
  }
  const match = shopIdOrUrl.match(/\/store\/(\d+)/);
  if (match) {
    return match[1];
  }
  return shopIdOrUrl.trim();
}

export async function GET() {
  const prodBlock = notFoundInProd();
  if (prodBlock) return prodBlock;

  const apiToken = (env.PRINTIFY_API_TOKEN || '').trim();
  const rawShopId = env.PRINTIFY_SHOP_ID;
  const shopId = extractShopId(rawShopId);

  if (!apiToken || !shopId) {
    return NextResponse.json(
      {
        error: 'Missing Printify credentials',
        message: 'PRINTIFY_API_TOKEN and PRINTIFY_SHOP_ID must be set in environment variables',
      },
      { status: 400 }
    );
  }

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'I-AM-RESIST-Shop/1.0',
  };

  try {
    let shopInfo = null;
    try {
      const shopResponse = await fetch(`https://api.printify.com/v1/shops/${shopId}.json`, {
        headers,
      });
      if (shopResponse.ok) {
        shopInfo = await shopResponse.json();
      }
    } catch {
      // continue
    }

    const response = await fetch(`https://api.printify.com/v1/shops/${shopId}/products.json`, {
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        errorDetails = errorText;
      }

      return NextResponse.json(
        {
          error: 'Failed to fetch products',
          details: errorDetails,
          status: response.status,
          shop_id_used: shopId,
          shop_found: Boolean(shopInfo),
          shop_title: shopInfo?.title || null,
          troubleshooting: {
            message:
              response.status === 401
                ? 'The Printify API returned 401. This usually means:'
                : 'The Printify API returned an error. This usually means:',
            possible_causes: [
              'PRINTIFY_SHOP_ID is incorrect — call GET /api/printify/list-shops to see your shops',
              "The shop ID doesn't exist or was deleted",
              "The API token doesn't have access to this shop",
              'The shop has no products yet',
            ],
            how_to_find_shop_id:
              'First call GET /api/printify/list-shops to list your shops. Use the id from that response as PRINTIFY_SHOP_ID.',
          },
        },
        { status: 200 }
      );
    }

    const data = await response.json();

    const products =
      data.data?.map((product) => ({
        id: product.id,
        title: product.title,
        description: product.description,
        tags: product.tags,
        is_enabled: product.is_enabled,
        created_at: product.created_at,
        updated_at: product.updated_at,
        variants: product.variants?.map((v) => ({
          id: v.id,
          title: v.title,
          is_enabled: v.is_enabled,
          price: v.price,
        })),
      })) || [];

    return NextResponse.json({
      success: true,
      count: products.length,
      products,
      example_product_id: products[0]?.id || null,
      message:
        products.length > 0
          ? `Found ${products.length} product(s). Use the 'id' field as your PRINTIFY_PRODUCT_ID.`
          : 'No products found. Make sure you have created a product in Printify.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Error fetching products',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
