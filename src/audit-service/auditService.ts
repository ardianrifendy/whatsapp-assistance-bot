import type { PoolClient, Pool } from 'pg';

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  performedBy?: string;
  groupId?: string;
  warehouseId?: string;
  beforeData?: unknown;
  afterData?: unknown;
  whatsappMessageId?: string;
}

/**
 * Writes one audit_logs row. Pass the same transaction client used for the
 * triggering mutation so the audit entry commits/rolls back atomically
 * with it — sensitive commands must never appear to succeed without a
 * matching audit record.
 */
export async function logAudit(client: PoolClient | Pool, entry: AuditEntry): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs (
       action, target_type, target_id, performed_by, group_id, warehouse_id,
       before_data, after_data, whatsapp_message_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.performedBy ?? null,
      entry.groupId ?? null,
      entry.warehouseId ?? null,
      entry.beforeData !== undefined ? JSON.stringify(entry.beforeData) : null,
      entry.afterData !== undefined ? JSON.stringify(entry.afterData) : null,
      entry.whatsappMessageId ?? null,
    ],
  );
}
