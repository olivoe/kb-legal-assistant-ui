// app/api/github/webhook/route.ts
// GitHub webhook handler for automatic knowledge base updates

import { NextRequest } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';

interface GitHubWebhookPayload {
  ref: string;
  repository: {
    name: string;
    full_name: string;
  };
  commits: Array<{
    id: string;
    message: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
}

function verifyGitHubWebhook(payload: string, signature: string, secret: string): boolean {
  if (!secret) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  const receivedSignature = signature.replace('sha256=', '');
  
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const receivedBuffer = Buffer.from(receivedSignature, 'hex');
  
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(
    new Uint8Array(expectedBuffer),
    new Uint8Array(receivedBuffer)
  );
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.text();
    const signature = req.headers.get('x-hub-signature-256') || '';
    const event = req.headers.get('x-github-event');
    
    // Verify webhook signature
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (webhookSecret && !verifyGitHubWebhook(payload, signature, webhookSecret)) {
      console.error('Invalid webhook signature');
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Only handle push events
    if (event !== 'push') {
      return new Response('OK', { status: 200 });
    }
    
    const data: GitHubWebhookPayload = JSON.parse(payload);
    
    // Check if this is our knowledge base repository
    const expectedRepo = process.env.GITHUB_REPO;
    if (expectedRepo && data.repository.name !== expectedRepo) {
      console.log(`Ignoring webhook for repository: ${data.repository.name}`);
      return new Response('OK', { status: 200 });
    }
    
    console.log(`GitHub webhook received for repository: ${data.repository.full_name}`);
    console.log(`Branch: ${data.ref}`);
    console.log(`Commits: ${data.commits.length}`);
    
    // Log file changes
    for (const commit of data.commits) {
      console.log(`Commit ${commit.id}: ${commit.message}`);
      
      if (commit.added.length > 0) {
        console.log(`  Added: ${commit.added.join(', ')}`);
      }
      
      if (commit.modified.length > 0) {
        console.log(`  Modified: ${commit.modified.join(', ')}`);
      }
      
      if (commit.removed.length > 0) {
        console.log(`  Removed: ${commit.removed.join(', ')}`);
      }
    }
    
    // TODO: Implement cache invalidation or re-indexing logic here
    // For now, we'll just log the changes
    
    // You could add logic to:
    // 1. Clear any cached embeddings
    // 2. Trigger a re-indexing process
    // 3. Update the KB index
    // 4. Send notifications to administrators
    
    return new Response('OK', { 
      status: 200,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
    
  } catch (error) {
    console.error('GitHub webhook error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function GET() {
  return new Response('GitHub webhook endpoint is active', { status: 200 });
}
