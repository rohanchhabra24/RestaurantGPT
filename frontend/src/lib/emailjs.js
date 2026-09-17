// Sends the landing page's "Book a demo" form (both the contact-message
// tab and the call-request tab) via EmailJS's plain REST endpoint rather
// than pulling in @emailjs/browser — this is a single POST with no SDK
// features (attachments, auto-reply) this form needs, so a fetch call
// keeps the dependency list unchanged.
//
// Requires a free EmailJS account (emailjs.com): create an email service,
// a template with variables matching what sendEmail() below sends in
// templateParams, then set VITE_EMAILJS_SERVICE_ID / _TEMPLATE_ID /
// _PUBLIC_KEY in frontend/.env — see .env.example. Until those are set,
// emailjsConfigured is false and the UI shows an inline message instead
// of silently failing.
const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";

export const emailjsConfigured = Boolean(
  import.meta.env.VITE_EMAILJS_SERVICE_ID &&
    import.meta.env.VITE_EMAILJS_TEMPLATE_ID &&
    import.meta.env.VITE_EMAILJS_PUBLIC_KEY
);

export async function sendEmail(templateParams) {
  if (!emailjsConfigured) {
    throw new Error("Email delivery isn't configured yet.");
  }
  const res = await fetch(EMAILJS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: import.meta.env.VITE_EMAILJS_SERVICE_ID,
      template_id: import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
      user_id: import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
      template_params: templateParams,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || "Failed to send — please try again.");
  }
}
