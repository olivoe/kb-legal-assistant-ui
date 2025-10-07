// app/api/github/rebuild/route.ts
// API endpoint to trigger KB rebuild from GitHub

import { NextRequest } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json();
    
    // Verify webhook secret
    const expectedSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('🔄 Triggering KB rebuild from GitHub...');

    // Run the KB build process
    try {
      const { stdout, stderr } = await execAsync('node scripts/build-kb-from-github.js');
      console.log('KB rebuild completed:', stdout);
      
      if (stderr) {
        console.error('KB rebuild warnings:', stderr);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'KB rebuild completed successfully',
        output: stdout 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error: any) {
      console.error('KB rebuild failed:', error);
      
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'KB rebuild failed',
        error: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    console.error('Webhook processing failed:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function GET() {
  return new Response('KB Rebuild endpoint is active', { status: 200 });
}
