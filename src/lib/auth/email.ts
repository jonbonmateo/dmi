/**
 * Outbound email, for exactly one thing: password-reset links.
 *
 * Same shape as every other optional integration in this app — live when a
 * credential exists, otherwise degraded to something safe and visible rather
 * than silently failing. Here "degraded" means the link is written to the
 * server log (and, in non-production, handed back in the API response) so
 * the whole reset flow is testable and demoable with zero mail setup.
 */
import { env, providerMode } from "@/lib/env";
import { log } from "@/lib/logger";

export interface SendResult {
  sent: boolean;
  /** Present only when no mail provider is configured — dev/demo convenience. */
  devLink: string | null;
  note: string;
}

export async function sendPasswordResetEmail(args: {
  to: string;
  resetUrl: string;
}): Promise<SendResult> {
  const mode = providerMode("email", env.resendApiKey);

  if (!mode.live) {
    log.warn("password reset link (no email provider configured)", {
      to: args.to,
      resetUrl: args.resetUrl,
    });
    return {
      sent: false,
      devLink: env.devResetLinks ? args.resetUrl : null,
      note: `${mode.reason}. The reset link was written to the server log instead of emailed.`,
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: args.to,
        subject: "Reset your DMI password",
        text: `Reset your password: ${args.resetUrl}\n\nThis link expires in one hour. If you did not request this, ignore this email.`,
        html: `<p>Reset your password by clicking the link below.</p><p><a href="${args.resetUrl}">${args.resetUrl}</a></p><p>This link expires in one hour. If you did not request this, ignore this email.</p>`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      log.error("password reset email failed to send", { status: res.status, body: body.slice(0, 300) });
      return { sent: false, devLink: null, note: `Email provider returned HTTP ${res.status}.` };
    }
    return { sent: true, devLink: null, note: "Reset email sent." };
  } catch (e) {
    log.error("password reset email failed to send", { error: e instanceof Error ? e.message : String(e) });
    return { sent: false, devLink: null, note: "Email provider request failed." };
  }
}
