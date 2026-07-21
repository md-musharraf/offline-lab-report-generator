import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ADMIN_DASHBOARD_URL = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || 'https://adminlabmanagement.vercel.app';

export async function GET(request: NextRequest) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const targetUrl = `${ADMIN_DASHBOARD_URL}/api/updates/latest`;
      const res = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      } else {
        return NextResponse.json({ success: false, reason: `Server returned status ${res.status}` }, { status: res.status });
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      return NextResponse.json({ success: false, offline: true, reason: 'Admin server unreachable' }, { status: 503 });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
