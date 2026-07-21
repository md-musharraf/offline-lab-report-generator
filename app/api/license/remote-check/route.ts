import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ADMIN_DASHBOARD_URL = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || 'https://adminlabmanagement.vercel.app';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const machineId = searchParams.get('machineId');

    if (!machineId) {
      return NextResponse.json({ success: false, error: 'machineId parameter is required' }, { status: 400 });
    }

    // Set up AbortController for a 2.5-second connection timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    try {
      const targetUrl = `${ADMIN_DASHBOARD_URL}/api/license/status?machineId=${encodeURIComponent(machineId)}`;
      const res = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' }
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      } else if (res.status === 404) {
        const errorData = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          status: 'DELETED',
          reason: errorData.reason || 'This machine is not registered in the database.'
        });
      } else {
        const errorData = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          status: errorData.status || 'ERROR',
          reason: errorData.reason || `Server returned error status ${res.status}`
        }, { status: res.status });
      }
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      console.warn('Admin Dashboard unreachable:', fetchErr.message);
      return NextResponse.json({
        success: false,
        offline: true,
        reason: 'Connection to admin dashboard server timed out or failed.'
      }, { status: 503 });
    }
  } catch (err: any) {
    console.error('Remote check proxy error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
