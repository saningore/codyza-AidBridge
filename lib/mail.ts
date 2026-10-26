import nodemailer from "nodemailer";

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

export async function sendMail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_HOST) return { sent: false as const };
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || "AidBridge <noreply@localhost>",
    to,
    subject,
    text,
  });
  return { sent: true as const };
}
