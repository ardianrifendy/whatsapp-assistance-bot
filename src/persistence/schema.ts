import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Mirrors migrations/0001_init_schema.sql. This is the typed read/write
// surface for services; the atomic mutation path still goes through the
// hand-authored process_stock_movement() SQL function (see
// migrations/0002_stock_movement_function.sql), not through Drizzle.

export const warehouses = pgTable('warehouses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  code: text('code').unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const botUsers = pgTable('bot_users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  whatsappNumber: text('whatsapp_number').notNull().unique(),
  displayName: text('display_name'),
  isOwner: boolean('is_owner').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const botGroups = pgTable('bot_groups', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  whatsappGroupId: text('whatsapp_group_id').notNull().unique(),
  warehouseId: uuid('warehouse_id')
    .notNull()
    .references(() => warehouses.id),
  name: text('name'),
  isActive: boolean('is_active').notNull().default(true),
  registeredBy: uuid('registered_by').references(() => botUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const groupMembers = pgTable(
  'group_members',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    groupId: uuid('group_id')
      .notNull()
      .references(() => botGroups.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => botUsers.id),
    role: text('role').notNull(), // 'admin' | 'user'
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [unique().on(t.groupId, t.userId)],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    unit: text('unit').notNull().default('pcs'),
    minStock: integer('min_stock').notNull().default(0),
    trackingMode: text('tracking_mode').notNull().default('quantity'), // 'quantity' | 'serial'
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [unique().on(t.warehouseId, t.sku)],
);

export const stockBalances = pgTable(
  'stock_balances',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    stockOwnerId: uuid('stock_owner_id')
      .notNull()
      .references(() => botUsers.id),
    qtyReady: integer('qty_ready').notNull().default(0),
    qtyInTransit: integer('qty_in_transit').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [unique().on(t.productId, t.warehouseId, t.stockOwnerId)],
);

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  movementNo: text('movement_no').notNull().unique(),
  movementType: text('movement_type').notNull(), // MASUK|DI_JALAN|TERIMA|KELUAR|KOREKSI|BATAL
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  warehouseId: uuid('warehouse_id')
    .notNull()
    .references(() => warehouses.id),
  stockOwnerId: uuid('stock_owner_id')
    .notNull()
    .references(() => botUsers.id),
  qty: integer('qty').notNull(),
  qtyReadyBefore: integer('qty_ready_before').notNull(),
  qtyReadyAfter: integer('qty_ready_after').notNull(),
  qtyInTransitBefore: integer('qty_in_transit_before').notNull(),
  qtyInTransitAfter: integer('qty_in_transit_after').notNull(),
  reference: text('reference'),
  reason: text('reason'),
  relatedMovementId: uuid('related_movement_id'),
  performedBy: uuid('performed_by')
    .notNull()
    .references(() => botUsers.id),
  groupId: uuid('group_id').references(() => botGroups.id),
  whatsappMessageId: text('whatsapp_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const stockUnits = pgTable(
  'stock_units',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    serialNumber: text('serial_number').notNull(),
    status: text('status').notNull().default('in_stock'), // in_stock|in_transit|out
    stockOwnerId: uuid('stock_owner_id').references(() => botUsers.id),
    warehouseId: uuid('warehouse_id').references(() => warehouses.id),
    movementId: uuid('movement_id').references(() => stockMovements.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [unique().on(t.productId, t.serialNumber)],
);

export const conversationSessions = pgTable('conversation_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionType: text('session_type').notNull(), // help_menu | confirmation
  userId: uuid('user_id')
    .notNull()
    .references(() => botUsers.id),
  groupId: uuid('group_id')
    .notNull()
    .references(() => botGroups.id),
  chatId: text('chat_id').notNull(),
  anchorMessageId: text('anchor_message_id'),
  payload: jsonb('payload').notNull().default({}),
  status: text('status').notNull().default('active'), // active|expired|completed|cancelled
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const processedMessages = pgTable('processed_messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  whatsappMessageId: text('whatsapp_message_id').notNull().unique(),
  chatId: text('chat_id'),
  command: text('command'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  performedBy: uuid('performed_by').references(() => botUsers.id),
  groupId: uuid('group_id').references(() => botGroups.id),
  warehouseId: uuid('warehouse_id').references(() => warehouses.id),
  beforeData: jsonb('before_data'),
  afterData: jsonb('after_data'),
  whatsappMessageId: text('whatsapp_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});
