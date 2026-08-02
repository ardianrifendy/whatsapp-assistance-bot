import type { Client } from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import { logger } from '../shared/logger.js';

/**
 * Prints the login QR code to the console/logs so a human can scan it with
 * the dedicated WhatsApp number, per instruksi.txt.
 */
export function registerQrHandler(client: Client): void {
  client.on('qr', (qr: string) => {
    logger.info('WhatsApp QR code received, scan with the dedicated bot number');
    qrcodeTerminal.generate(qr, { small: true });
  });
}
