/**
 * Converts any WhatsApp JID variant into the canonical digits-only format
 * used as `bot_users.whatsapp_number` throughout the system.
 *
 * Handles formats such as:
 *  - "628123456789@c.us"
 *  - "628123456789@s.whatsapp.net"
 *  - "628123456789:12@c.us" (device-suffixed JID)
 *  - "+628123456789@c.us" (defensive: strips a leading plus if ever present)
 *
 * Strategy: drop everything from "@" onward, then drop everything from ":"
 * onward (the device id), then strip any remaining non-digit characters.
 */
export function normalizeWhatsAppNumber(jid: string): string {
  if (!jid) return '';

  const withoutDomain = jid.split('@')[0] ?? jid;
  const withoutDevice = withoutDomain.split(':')[0] ?? withoutDomain;
  return withoutDevice.replace(/\D/g, '');
}
