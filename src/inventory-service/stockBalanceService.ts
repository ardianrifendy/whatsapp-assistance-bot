import type { Pool } from 'pg';
import type { Product } from './productService.js';

export interface StockLine {
  sku: string;
  name: string;
  unit: string;
  minStock: number;
  qtyReady: number;
  qtyInTransit: number;
  qtyTotal: number;
}

export interface OwnerStockLine extends StockLine {
  ownerId: string;
  ownerName: string | null;
  ownerNumber: string;
}

export interface WarehouseSummary {
  totalProducts: number;
  totalQtyReady: number;
  totalQtyInTransit: number;
  lowStockCount: number;
}

export interface ResolvedWarehouseUser {
  id: string;
  displayName: string | null;
  whatsappNumber: string;
}

interface StockLineRow {
  sku: string;
  name: string;
  unit: string;
  min_stock: number;
  qty_ready: number;
  qty_in_transit: number;
}

function toStockLine(row: StockLineRow): StockLine {
  return {
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    minStock: row.min_stock,
    qtyReady: row.qty_ready,
    qtyInTransit: row.qty_in_transit,
    qtyTotal: row.qty_ready + row.qty_in_transit,
  };
}

/** Stock owned by a single user (`!stok saya`, `!stok user <...>`). Only products this user has ever touched appear. */
export async function getUserStock(pool: Pool, warehouseId: string, userId: string): Promise<StockLine[]> {
  const result = await pool.query<StockLineRow>(
    `SELECT p.sku, p.name, p.unit, p.min_stock, sb.qty_ready, sb.qty_in_transit
     FROM stock_balances sb
     JOIN products p ON p.id = sb.product_id
     WHERE sb.warehouse_id = $1 AND sb.stock_owner_id = $2
     ORDER BY p.name`,
    [warehouseId, userId],
  );
  return result.rows.map(toStockLine);
}

/** Warehouse-wide totals per product, summed across every owner (`!stok list`). */
export async function getWarehouseStockList(pool: Pool, warehouseId: string): Promise<StockLine[]> {
  const result = await pool.query<StockLineRow>(
    `SELECT p.sku, p.name, p.unit, p.min_stock,
            COALESCE(SUM(sb.qty_ready), 0)::int AS qty_ready,
            COALESCE(SUM(sb.qty_in_transit), 0)::int AS qty_in_transit
     FROM products p
     LEFT JOIN stock_balances sb ON sb.product_id = p.id AND sb.warehouse_id = p.warehouse_id
     WHERE p.warehouse_id = $1 AND p.is_active = true
     GROUP BY p.id, p.sku, p.name, p.unit, p.min_stock
     ORDER BY p.name`,
    [warehouseId],
  );
  return result.rows.map(toStockLine);
}

export async function getLowStockList(pool: Pool, warehouseId: string): Promise<StockLine[]> {
  const result = await pool.query<StockLineRow>(
    `SELECT p.sku, p.name, p.unit, p.min_stock,
            COALESCE(SUM(sb.qty_ready), 0)::int AS qty_ready,
            COALESCE(SUM(sb.qty_in_transit), 0)::int AS qty_in_transit
     FROM products p
     LEFT JOIN stock_balances sb ON sb.product_id = p.id AND sb.warehouse_id = p.warehouse_id
     WHERE p.warehouse_id = $1 AND p.is_active = true
     GROUP BY p.id, p.sku, p.name, p.unit, p.min_stock
     HAVING COALESCE(SUM(sb.qty_ready), 0) < p.min_stock
     ORDER BY p.name`,
    [warehouseId],
  );
  return result.rows.map(toStockLine);
}

export async function searchStock(pool: Pool, warehouseId: string, keyword: string): Promise<StockLine[]> {
  const result = await pool.query<StockLineRow>(
    `SELECT p.sku, p.name, p.unit, p.min_stock,
            COALESCE(SUM(sb.qty_ready), 0)::int AS qty_ready,
            COALESCE(SUM(sb.qty_in_transit), 0)::int AS qty_in_transit
     FROM products p
     LEFT JOIN stock_balances sb ON sb.product_id = p.id AND sb.warehouse_id = p.warehouse_id
     WHERE p.warehouse_id = $1 AND p.is_active = true
       AND (p.sku ILIKE $2 OR p.name ILIKE $2 OR EXISTS (
         SELECT 1 FROM unnest(p.aliases) alias WHERE alias ILIKE $2
       ))
     GROUP BY p.id, p.sku, p.name, p.unit, p.min_stock
     ORDER BY p.name
     LIMIT 50`,
    [warehouseId, `%${keyword}%`],
  );
  return result.rows.map(toStockLine);
}

export async function getProductStockBreakdown(
  pool: Pool,
  product: Product,
): Promise<{ total: StockLine; owners: OwnerStockLine[] }> {
  const result = await pool.query<{
    owner_id: string;
    display_name: string | null;
    whatsapp_number: string;
    qty_ready: number;
    qty_in_transit: number;
  }>(
    `SELECT sb.stock_owner_id AS owner_id, bu.display_name, bu.whatsapp_number,
            sb.qty_ready, sb.qty_in_transit
     FROM stock_balances sb
     JOIN bot_users bu ON bu.id = sb.stock_owner_id
     WHERE sb.product_id = $1 AND sb.warehouse_id = $2
       AND (sb.qty_ready > 0 OR sb.qty_in_transit > 0)
     ORDER BY bu.display_name NULLS LAST`,
    [product.id, product.warehouseId],
  );

  const owners: OwnerStockLine[] = result.rows.map((r) => ({
    sku: product.sku,
    name: product.name,
    unit: product.unit,
    minStock: product.minStock,
    qtyReady: r.qty_ready,
    qtyInTransit: r.qty_in_transit,
    qtyTotal: r.qty_ready + r.qty_in_transit,
    ownerId: r.owner_id,
    ownerName: r.display_name,
    ownerNumber: r.whatsapp_number,
  }));

  const totalReady = owners.reduce((sum, o) => sum + o.qtyReady, 0);
  const totalTransit = owners.reduce((sum, o) => sum + o.qtyInTransit, 0);

  return {
    total: {
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      minStock: product.minStock,
      qtyReady: totalReady,
      qtyInTransit: totalTransit,
      qtyTotal: totalReady + totalTransit,
    },
    owners,
  };
}

/** Resolves `!stok user <nama|nomor>` against members of this warehouse's group(s) only. */
export async function resolveWarehouseUser(
  pool: Pool,
  warehouseId: string,
  identifier: string,
): Promise<ResolvedWarehouseUser | null> {
  const result = await pool.query<{ id: string; display_name: string | null; whatsapp_number: string }>(
    `SELECT DISTINCT bu.id, bu.display_name, bu.whatsapp_number
     FROM bot_users bu
     JOIN group_members gm ON gm.user_id = bu.id
     JOIN bot_groups bg ON bg.id = gm.group_id
     WHERE bg.warehouse_id = $1
       AND (bu.display_name ILIKE $2 OR bu.whatsapp_number ILIKE $2)
     LIMIT 1`,
    [warehouseId, `%${identifier}%`],
  );
  const row = result.rows[0];
  return row ? { id: row.id, displayName: row.display_name, whatsappNumber: row.whatsapp_number } : null;
}

export async function getWarehouseSummary(pool: Pool, warehouseId: string): Promise<WarehouseSummary> {
  const totalsResult = await pool.query<{
    total_products: string;
    total_ready: string;
    total_transit: string;
  }>(
    `SELECT COUNT(DISTINCT p.id) AS total_products,
            COALESCE(SUM(sb.qty_ready), 0) AS total_ready,
            COALESCE(SUM(sb.qty_in_transit), 0) AS total_transit
     FROM products p
     LEFT JOIN stock_balances sb ON sb.product_id = p.id AND sb.warehouse_id = p.warehouse_id
     WHERE p.warehouse_id = $1 AND p.is_active = true`,
    [warehouseId],
  );
  const row = totalsResult.rows[0];
  const lowStock = await getLowStockList(pool, warehouseId);

  return {
    totalProducts: Number(row?.total_products ?? 0),
    totalQtyReady: Number(row?.total_ready ?? 0),
    totalQtyInTransit: Number(row?.total_transit ?? 0),
    lowStockCount: lowStock.length,
  };
}
