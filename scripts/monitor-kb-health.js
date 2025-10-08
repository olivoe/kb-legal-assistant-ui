#!/usr/bin/env node
/**
 * KB Health Monitor
 * Checks KB health endpoint and alerts on issues
 * Can be run as a cron job or GitHub Action
 */

require('dotenv').config({ path: '.env.local' });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://ai.olivogalarza.com';
const HEALTH_ENDPOINT = `${SITE_URL}/api/kb/health`;
const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK_URL; // Optional: Slack/Discord webhook
const ALERT_EMAIL = process.env.ALERT_EMAIL; // Optional: email for alerts

class KBHealthMonitor {
  async check() {
    console.log('🏥 KB Health Monitor');
    console.log('====================');
    console.log(`Checking: ${HEALTH_ENDPOINT}`);
    console.log('');

    try {
      const response = await fetch(HEALTH_ENDPOINT);
      const health = await response.json();

      this.printStatus(health);

      // Determine if we should alert
      if (health.status === 'unhealthy') {
        await this.sendAlert(health, 'critical');
        process.exit(1); // Exit with error for CI/monitoring
      } else if (health.status === 'degraded') {
        await this.sendAlert(health, 'warning');
        process.exit(0); // Exit OK but log warning
      } else {
        console.log('✅ All systems healthy!');
        process.exit(0);
      }
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      await this.sendAlert({ error: error.message }, 'critical');
      process.exit(1);
    }
  }

  printStatus(health) {
    const statusEmoji = {
      healthy: '✅',
      degraded: '⚠️',
      unhealthy: '❌'
    };

    console.log(`Status: ${statusEmoji[health.status] || '❓'} ${health.status.toUpperCase()}`);
    console.log(`Timestamp: ${health.timestamp}`);
    console.log('');

    if (health.embeddings) {
      console.log('📊 Embeddings:');
      console.log(`   Total: ${health.embeddings.total}`);
      console.log(`   Last Updated: ${health.embeddings.lastUpdated || 'unknown'}`);
      console.log(`   File Size: ${health.embeddings.fileSizeKB} KB`);
      console.log('');
    }

    if (health.index) {
      console.log('📚 Index:');
      console.log(`   Total Documents: ${health.index.total}`);
      console.log(`   Last Updated: ${health.index.lastUpdated || 'unknown'}`);
      console.log(`   File Size: ${health.index.fileSizeKB} KB`);
      console.log('');
    }

    if (health.coverage) {
      console.log('📈 Coverage:');
      console.log(`   Percentage: ${health.coverage.percentage}%`);
      console.log(`   Missing: ${health.coverage.missing}`);
      console.log(`   Status: ${health.coverage.status}`);
      console.log('');
    }

    if (health.issues && health.issues.length > 0) {
      console.log('⚠️  Issues:');
      health.issues.forEach(issue => console.log(`   - ${issue}`));
      console.log('');
    }
  }

  async sendAlert(health, severity) {
    const message = this.formatAlertMessage(health, severity);

    // Send to webhook (Slack/Discord)
    if (ALERT_WEBHOOK) {
      try {
        await this.sendWebhookAlert(message, severity);
        console.log('✅ Alert sent to webhook');
      } catch (error) {
        console.error('❌ Failed to send webhook alert:', error.message);
      }
    }

    // Send email (if configured)
    if (ALERT_EMAIL) {
      console.log(`📧 Alert would be sent to: ${ALERT_EMAIL}`);
      console.log('   (Email sending not implemented, use webhook or external service)');
    }

    // Log to console
    console.log('');
    console.log('🚨 ALERT:');
    console.log(message);
  }

  formatAlertMessage(health, severity) {
    const emoji = severity === 'critical' ? '🔴' : '🟡';
    let message = `${emoji} KB Health Alert: ${severity.toUpperCase()}\n\n`;

    if (health.error) {
      message += `Error: ${health.error}\n`;
    } else {
      message += `Status: ${health.status}\n`;
      message += `Coverage: ${health.coverage?.percentage || 0}%\n`;
      message += `Missing: ${health.coverage?.missing || 0} documents\n\n`;

      if (health.issues && health.issues.length > 0) {
        message += 'Issues:\n';
        health.issues.forEach(issue => {
          message += `  - ${issue}\n`;
        });
      }
    }

    message += `\nTime: ${new Date().toISOString()}`;
    message += `\nSite: ${SITE_URL}`;

    return message;
  }

  async sendWebhookAlert(message, severity) {
    const color = severity === 'critical' ? '#ff0000' : '#ffaa00';
    
    // Slack format
    const slackPayload = {
      text: message,
      attachments: [{
        color: color,
        text: message,
        footer: 'KB Health Monitor',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    // Discord format
    const discordPayload = {
      content: message,
      embeds: [{
        title: `KB Health Alert: ${severity.toUpperCase()}`,
        description: message,
        color: severity === 'critical' ? 16711680 : 16755200,
        timestamp: new Date().toISOString()
      }]
    };

    // Try to detect webhook type from URL
    const payload = ALERT_WEBHOOK.includes('discord') ? discordPayload : slackPayload;

    const response = await fetch(ALERT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }
  }

  /**
   * Run continuous monitoring (for local development)
   */
  async monitor(intervalMinutes = 5) {
    console.log(`🔄 Starting continuous monitoring (every ${intervalMinutes} minutes)`);
    console.log('Press Ctrl+C to stop');
    console.log('');

    while (true) {
      await this.check();
      await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60 * 1000));
    }
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const monitor = new KBHealthMonitor();

  if (args.includes('--watch')) {
    const interval = parseInt(args[args.indexOf('--watch') + 1] || '5');
    monitor.monitor(interval).catch(error => {
      console.error('Monitor error:', error);
      process.exit(1);
    });
  } else {
    monitor.check();
  }
}

module.exports = { KBHealthMonitor };
