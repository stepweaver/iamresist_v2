/**
 * GET /api/printify/list-shops — list Printify shops (non-production only).
 */

import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const apiToken = (env.PRINTIFY_API_TOKEN || '').trim();

  if (!apiToken) {
    return NextResponse.json(
      {
        error: 'Missing Printify credentials',
        message: 'PRINTIFY_API_TOKEN must be set in environment variables',
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
    const response = await fetch('https://api.printify.com/v1/shops.json', {
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
          error: 'Failed to fetch shops',
          details: errorDetails,
          status: response.status,
          troubleshooting: {
            message: 'The Printify API returned an error. This usually means:',
            possible_causes: [
              'PRINTIFY_API_TOKEN is invalid or expired',
              'Generate a new token at Printify → Settings → API',
            ],
          },
        },
        { status: 200 }
      );
    }

    const shops = await response.json();

    const formatted = Array.isArray(shops)
      ? shops.map((s) => ({ id: s.id, title: s.title }))
      : [];

    return NextResponse.json({
      success: true,
      count: formatted.length,
      shops: formatted,
      message:
        formatted.length > 0
          ? `Found ${formatted.length} shop(s). Use the 'id' field as PRINTIFY_SHOP_ID in .env.local, then call /api/printify/list-products to get product IDs.`
          : 'No shops found. Create a shop in Printify first.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Error fetching shops',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
