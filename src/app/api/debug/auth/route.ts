import { NextRequest, NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/apiBase';

export async function GET() {
  const apiBase = getApiBaseUrl();
  
  try {
    // Test auth service connectivity
    const response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: 'test@example.com',
        password: 'wrongpassword'
      }),
    });
    
    const text = await response.text();
    
    return NextResponse.json({
      success: true,
      debug: {
        apiBase,
        authEndpoint: `${apiBase}/auth/login`,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        responseText: text,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        apiBase,
        authEndpoint: `${apiBase}/auth/login`,
        timestamp: new Date().toISOString(),
      }
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const apiBase = getApiBaseUrl();
  const body = await request.json();
  
  try {
    // Test actual login attempt
    const response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const text = await response.text();
    
    return NextResponse.json({
      success: true,
      debug: {
        apiBase,
        authEndpoint: `${apiBase}/auth/login`,
        requestBody: body,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        responseText: text,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        apiBase,
        authEndpoint: `${apiBase}/auth/login`,
        requestBody: body,
        timestamp: new Date().toISOString(),
      }
    }, { status: 500 });
  }
}