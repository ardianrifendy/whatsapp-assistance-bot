import { registerCommand } from '../../command-router/registry.js';
import { withTransaction } from '../../persistence/transactions.js';
import { logAudit } from '../../audit-service/auditService.js';
import { pool } from '../../persistence/db.js';
import { sessionService } from '../deps.js';
import { processMovement } from '../stockMovementService.js';
import { isStockMutationPayload } from '../previewService.js';
import {
  completeClearAll,
  completeClearRecent,
  isClearAllPayload,
  isClearRecentPayload,
} from '../../chat-moderation-service/clearService.js';

// !ya — step 2 of the preview/confirm convention. Resolved via quoted-reply
// to the preview message by the router (dispatch.ts's resolveSessionId,
// Worker D's wiring), which sets ctx.sessionId before this handler runs.
registerCommand({
  name: 'ya',
  allowedRoles: 'any',
  requiresRegisteredGroup: true,
  requiresPreviewConfirm: false,
  handler: async (ctx) => {
    if (!ctx.sessionId) {
      return { text: '🤔 Tidak ada konfirmasi yang aktif untuk Anda. Coba jalankan lagi perintah transaksinya.' };
    }

    const session = await sessionService.getSession(ctx.sessionId);
    if (
      !session ||
      session.sessionType !== 'confirmation' ||
      session.status !== 'active' ||
      session.expiresAt.getTime() <= Date.now() ||
      session.userId !== ctx.userId
    ) {
      return { text: '⏱️ Konfirmasi ini sudah kedaluwarsa. Silakan ulangi perintah transaksinya.' };
    }

    // The generic "!ya" confirmation is shared across domains: stock
    // mutations (this file's own concern), and chat-moderation-service's
    // "!clear recent" / "!clear all" confirmations, which store a
    // differently-shaped payload in the same conversation_sessions table.
    if (isClearRecentPayload(session.payload)) {
      const result = await completeClearRecent(pool, session.payload, ctx.messageId);
      await sessionService.completeSession(ctx.sessionId);
      return result;
    }
    if (isClearAllPayload(session.payload)) {
      const result = await completeClearAll(pool, session.payload, ctx.messageId);
      await sessionService.completeSession(ctx.sessionId);
      return result;
    }

    if (!isStockMutationPayload(session.payload)) {
      return { text: '⚠️ Konfirmasi tidak valid. Silakan ulangi perintah transaksinya.' };
    }
    const payload = session.payload;

    // All-or-nothing: every line runs through process_stock_movement() on
    // the same transaction client, so a failure on any line (e.g.
    // INSUFFICIENT_STOCK) rolls back everything already applied in this
    // batch — see migrations/0002_stock_movement_function.sql and
    // src/persistence/transactions.ts.
    const summaryLines = await withTransaction(async (client) => {
      const results: string[] = [];
      for (const line of payload.lines) {
        const movement = await processMovement(client, {
          productId: line.productId,
          warehouseId: ctx.warehouseId,
          ownerId: line.ownerId,
          movementType: payload.movementType,
          qty: line.qty,
          reference: payload.reference,
          reason: payload.reason,
          performedBy: ctx.userId,
          groupId: ctx.groupId,
          relatedMovementId: line.relatedMovementId ?? null,
          whatsappMessageId: ctx.messageId,
        });

        await logAudit(client, {
          action: `stock.${payload.movementType.toLowerCase()}`,
          targetType: 'stock_movement',
          targetId: movement.id,
          performedBy: ctx.userId,
          groupId: ctx.groupId,
          warehouseId: ctx.warehouseId,
          beforeData: { qtyReady: movement.qtyReadyBefore, qtyInTransit: movement.qtyInTransitBefore },
          afterData: { qtyReady: movement.qtyReadyAfter, qtyInTransit: movement.qtyInTransitAfter },
          whatsappMessageId: ctx.messageId,
        });

        results.push(
          `${movement.movementNo}: ${line.sku} - ${line.productName} -> Ready ${movement.qtyReadyAfter} | Di Jalan ${movement.qtyInTransitAfter}`,
        );
      }
      return results;
    });

    await sessionService.completeSession(ctx.sessionId);

    return { text: `✅ *Transaksi berhasil!*\n${summaryLines.join('\n')}` };
  },
});
