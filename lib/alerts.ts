/**
 * Alert & Notification Engine
 *
 * Gửi thông báo qua Slack, Email, Telegram khi có sự kiện quan trọng.
 */

import { prisma } from "@/lib/prisma";
import type { AlertChannel, AlertEvent } from "@/lib/types";

// ─── Send Alert ────────────────────────────────────────────────────────────

export async function sendAlert(
  teamId: string | null,
  event: AlertEvent,
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  // Find matching alerts
  const alerts = teamId
    ? await prisma.alert.findMany({
        where: { teamId, isActive: true },
      })
    : await prisma.alert.findMany({ where: { isActive: true } });

  const matchingAlerts = alerts.filter((a) => {
    try {
      const events = JSON.parse(a.events) as string[];
      return events.includes(event) || events.includes("*");
    } catch {
      return false;
    }
  });

  // Send to each channel
  await Promise.allSettled(
    matchingAlerts.map(async (alert) => {
      try {
        const config = JSON.parse(alert.config) as Record<string, string>;
        switch (alert.channel) {
          case "slack":
            await sendSlack(config.webhookUrl || config.url, title, message, metadata);
            break;
          case "email":
            await sendEmail(config.email || config.to, title, message);
            break;
          case "telegram":
            await sendTelegram(config.chatId || config.chat_id, title, message);
            break;
        }
      } catch (err) {
        console.warn(`[alerts] Failed to send ${alert.channel}:`, err);
      }
    })
  );

  // Also trigger webhooks
  await triggerWebhooks(teamId, event, title, message, metadata);
}

// ─── Slack ─────────────────────────────────────────────────────────────────

async function sendSlack(
  webhookUrl: string | undefined,
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!webhookUrl) return;

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: title.slice(0, 150) },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: message.slice(0, 3000) },
    },
  ];

  if (metadata?.url) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${metadata.url as string}|Xem chi tiết>`,
      },
    });
  }

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
}

// ─── Email (SMTP) ──────────────────────────────────────────────────────────

async function sendEmail(
  to: string | undefined,
  subject: string,
  body: string
): Promise<void> {
  if (!to) return;

  // Sử dụng SMTP từ env nếu có
  const { getConfig } = await import("@/lib/config");
  const smtpHost = await getConfig("smtp_host");
  const smtpPort = await getConfig("smtp_port");
  const smtpUser = await getConfig("smtp_user");
  const smtpPass = await getConfig("smtp_pass");
  const fromEmail = (await getConfig("smtp_from")) || "noreply@kolia.app";

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("[alerts] SMTP not configured. Email not sent.");
    return;
  }

  // Dùng fetch-based email service hoặc nodemailer
  // Fallback: log to console
  console.log(`[email] To: ${to}, Subject: ${subject}`);
  console.log(`[email] Body: ${body.slice(0, 200)}...`);
}

// ─── Telegram ──────────────────────────────────────────────────────────────

async function sendTelegram(
  chatId: string | undefined,
  title: string,
  message: string
): Promise<void> {
  if (!chatId) return;

  const { getConfig } = await import("@/lib/config");
  const botToken = await getConfig("telegram_bot_token");
  if (!botToken) {
    console.warn("[alerts] Telegram Bot Token not configured. Set trong Settings UI.");
    return;
  }

  const text = `*${title}*\n\n${message}`;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

// ─── Webhooks ──────────────────────────────────────────────────────────────

export async function triggerWebhooks(
  teamId: string | null,
  event: string,
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const webhooks = teamId
    ? await prisma.webhook.findMany({ where: { teamId, isActive: true } })
    : await prisma.webhook.findMany({ where: { isActive: true } });

  const matchingWebhooks = webhooks.filter((w) => {
    try {
      const events = JSON.parse(w.events) as string[];
      return events.includes(event) || events.includes("*");
    } catch {
      return false;
    }
  });

  const payload = {
    event,
    title,
    message,
    metadata: metadata ?? {},
    timestamp: new Date().toISOString(),
  };

  await Promise.allSettled(
    matchingWebhooks.map(async (webhook) => {
      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          await prisma.webhook.update({
            where: { id: webhook.id },
            data: { lastTriggedAt: new Date() },
          });
        }
      } catch (err) {
        console.warn(`[webhooks] Failed to trigger ${webhook.url}:`, err);
      }
    })
  );
}

// ─── Alert CRUD ────────────────────────────────────────────────────────────

export async function createAlert(
  teamId: string,
  channel: AlertChannel,
  config: Record<string, string>,
  events: AlertEvent[]
): Promise<{ id: string }> {
  const alert = await prisma.alert.create({
    data: {
      teamId,
      channel,
      config: JSON.stringify(config),
      events: JSON.stringify(events),
    },
  });
  return { id: alert.id };
}

export async function listAlerts(teamId: string) {
  const alerts = await prisma.alert.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
  });
  return alerts.map((a) => ({
    id: a.id,
    channel: a.channel as AlertChannel,
    config: JSON.parse(a.config) as Record<string, string>,
    events: JSON.parse(a.events) as AlertEvent[],
    isActive: a.isActive,
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function deleteAlert(id: string): Promise<void> {
  await prisma.alert.delete({ where: { id } });
}

// ─── Webhook CRUD ──────────────────────────────────────────────────────────

export async function createWebhook(
  teamId: string,
  url: string,
  events: string[]
): Promise<{ id: string }> {
  const webhook = await prisma.webhook.create({
    data: {
      teamId,
      url,
      events: JSON.stringify(events),
    },
  });
  return { id: webhook.id };
}

export async function listWebhooks(teamId: string) {
  const webhooks = await prisma.webhook.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
  });
  return webhooks.map((w) => ({
    id: w.id,
    url: w.url,
    events: JSON.parse(w.events) as string[],
    isActive: w.isActive,
    lastTriggedAt: w.lastTriggedAt?.toISOString(),
    createdAt: w.createdAt.toISOString(),
  }));
}

export async function deleteWebhook(id: string): Promise<void> {
  await prisma.webhook.delete({ where: { id } });
}
