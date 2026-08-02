import type { SessionService } from '../types/session.js';
import type { HandlerContext } from '../types/context.js';
import type { CommandResult } from '../types/command.js';
import type { MovementType } from '../shared/constants.js';
import { env } from '../config/env.js';

/**
 * One line item inside a pending stock mutation. `ownerId` is the
 * stock_balances owner the mutation applies to — for masuk/dijalan/keluar/
 * koreksi this is the person running the command; for terima/batal it's
 * carried over from the referenced movement (see commands/terima.ts,
 * commands/batal.ts).
 */
export interface StockMutationLine {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  /** Positive for MASUK/DI_JALAN/TERIMA/KELUAR/BATAL; signed (+/-) for KOREKSI. */
  qty: number;
  ownerId: string;
  relatedMovementId?: string | null;
}

/**
 * Shape stored as `conversation_sessions.payload` for every mutation
 * command (masuk/dijalan/terima/keluar/koreksi/batal). This is the
 * contract the "!ya" handler reads back out — see src/inventory-service/
 * commands/ya.ts.
 */
export interface StockMutationPayload {
  type: 'stock_mutation';
  movementType: MovementType;
  reference: string | null;
  reason: string | null;
  lines: StockMutationLine[];
}

const CONFIRM_FOOTER =
  '\n\n👉 Balas (quote) pesan ini lalu ketik !ya untuk konfirmasi, atau !cancel untuk batal.';

function movementLabel(type: MovementType): string {
  switch (type) {
    case 'MASUK':
      return 'Barang Masuk';
    case 'DI_JALAN':
      return 'Barang Di Jalan';
    case 'TERIMA':
      return 'Terima Barang';
    case 'KELUAR':
      return 'Barang Keluar';
    case 'KOREKSI':
      return 'Koreksi Stok';
    case 'BATAL':
      return 'Pembatalan Transaksi';
    default:
      return type;
  }
}

export function formatStockMutationPreview(payload: StockMutationPayload): string {
  const lines: string[] = [`📝 *Pratinjau ${movementLabel(payload.movementType)}*`];
  if (payload.reference) lines.push(`Referensi: ${payload.reference}`);
  if (payload.reason) lines.push(`Alasan: ${payload.reason}`);
  lines.push('');
  payload.lines.forEach((line, idx) => {
    const showSign = payload.movementType === 'KOREKSI' && line.qty > 0;
    lines.push(`${idx + 1}. ${line.sku} - ${line.productName}: ${showSign ? '+' : ''}${line.qty} ${line.unit}`);
  });
  return lines.join('\n');
}

/**
 * Runtime guard for payload read back from conversation_sessions.payload
 * (stored/typed as `unknown`) before the "!ya" handler trusts its shape.
 */
export function isStockMutationPayload(payload: unknown): payload is StockMutationPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (p.type !== 'stock_mutation' || typeof p.movementType !== 'string' || !Array.isArray(p.lines)) {
    return false;
  }
  return p.lines.every((l) => {
    if (typeof l !== 'object' || l === null) return false;
    const line = l as Record<string, unknown>;
    return (
      typeof line.productId === 'string' &&
      typeof line.sku === 'string' &&
      typeof line.qty === 'number' &&
      typeof line.ownerId === 'string'
    );
  });
}

/**
 * Step 1 of the preview/confirm convention: builds the preview text,
 * opens a confirmation session (without an anchor yet — the router
 * attaches it after the preview message is actually sent), and returns
 * the CommandResult a mutation command handler should return as-is.
 */
export async function createStockMutationPreview(
  sessionService: SessionService,
  ctx: HandlerContext,
  payload: StockMutationPayload,
): Promise<CommandResult> {
  const text = formatStockMutationPreview(payload) + CONFIRM_FOOTER;
  const { sessionId } = await sessionService.createConfirmation({
    userId: ctx.userId,
    groupId: ctx.groupId,
    chatId: ctx.chatId,
    payload,
    ttlMinutes: env.SESSION_EXPIRY_MINUTES,
  });
  return { text, pendingSessionId: sessionId };
}
