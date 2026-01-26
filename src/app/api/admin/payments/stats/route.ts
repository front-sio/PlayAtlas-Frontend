import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { getApiBaseUrl } from '@/lib/apiBase';

const ADMIN_ROLES = [
  'admin',
  'super_admin',
  'superuser',
  'superadmin',
  'finance_manager',
  'manager',
  'director',
  'staff',
  'game_manager',
  'game_master'
];

async function getAdminStats(token: string, retryCount = 0): Promise<{ success: boolean; data: { pendingDeposits: number; pendingCashouts: number } }> {
  try {
    const API_URL = getApiBaseUrl();
    
    const response = await fetch(`${API_URL}/payment/admin/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (!response.ok) {
      // Rate limited - return zeros with warning
      if (response.status === 429) {
        console.warn('Rate limited when fetching admin stats, returning zeros');
        return { success: true, data: { pendingDeposits: 0, pendingCashouts: 0 } };
      }
      
      console.error('Failed to fetch admin stats:', response.status, response.statusText);
      return { success: false, data: { pendingDeposits: 0, pendingCashouts: 0 } };
    }

    return await response.json();
  } catch (error: any) {
    // Connection refused or timeout - service may be down
    if (error.name === 'AbortError' || error.code === 'ECONNREFUSED') {
      console.warn('Payment service unavailable, returning zeros');
      return { success: true, data: { pendingDeposits: 0, pendingCashouts: 0 } };
    }
    
    console.error('Error fetching admin stats:', error);
    
    // Retry once for transient errors
    if (retryCount < 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return getAdminStats(token, retryCount + 1);
    }
    
    return { success: false, data: { pendingDeposits: 0, pendingCashouts: 0 } };
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = (session.user as any).role;
    
    // Check if user is admin
    if (!ADMIN_ROLES.includes(role?.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const token = (session as any).accessToken;
    
    if (!token) {
      return NextResponse.json({ error: 'No access token' }, { status: 401 });
    }

    const result = await getAdminStats(token);
    
    // Ensure the response has the expected structure
    const data = {
      pendingDeposits: result.data?.pendingDeposits || 0,
      pendingCashouts: result.data?.pendingCashouts || 0
    };

    return NextResponse.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Admin stats API error:', error);
    return NextResponse.json(
      { 
        success: true, 
        data: { pendingDeposits: 0, pendingCashouts: 0 } 
      },
      { status: 200 }
    );
  }
}
