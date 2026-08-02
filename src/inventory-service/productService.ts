import type { Pool, PoolClient } from 'pg';
import { UserFacingError } from '../shared/errors.js';

/** Either a pooled connection or a transaction client — every read/write here works with both. */
type Queryable = Pool | PoolClient;

export type TrackingMode = 'quantity' | 'serial';

export interface Product {
  id: string;
  warehouseId: string;
  sku: string;
  name: string;
  aliases: string[];
  unit: string;
  minStock: number;
  trackingMode: TrackingMode;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductRow {
  id: string;
  warehouse_id: string;
  sku: string;
  name: string;
  aliases: string[];
  unit: string;
  min_stock: number;
  tracking_mode: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    sku: row.sku,
    name: row.name,
    aliases: row.aliases,
    unit: row.unit,
    minStock: row.min_stock,
    trackingMode: row.tracking_mode as TrackingMode,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

/** Finds a product by SKU regardless of active status (used by history/lookups that must see inactive products too). */
export async function findProductBySku(
  db: Queryable,
  warehouseId: string,
  sku: string,
): Promise<Product | null> {
  const result = await db.query<ProductRow>(
    `SELECT * FROM products WHERE warehouse_id = $1 AND upper(sku) = upper($2)`,
    [warehouseId, sku],
  );
  const row = result.rows[0];
  return row ? toProduct(row) : null;
}

export async function findProductById(db: Queryable, productId: string): Promise<Product | null> {
  const result = await db.query<ProductRow>(`SELECT * FROM products WHERE id = $1`, [productId]);
  const row = result.rows[0];
  return row ? toProduct(row) : null;
}

/** Used by batch parsing / new transactions — inactive products must not accept new movements. */
export async function findActiveProductBySku(
  db: Queryable,
  warehouseId: string,
  sku: string,
): Promise<Product | null> {
  const result = await db.query<ProductRow>(
    `SELECT * FROM products WHERE warehouse_id = $1 AND upper(sku) = upper($2) AND is_active = true`,
    [warehouseId, sku],
  );
  const row = result.rows[0];
  return row ? toProduct(row) : null;
}

export interface AddProductInput {
  warehouseId: string;
  sku: string;
  name: string;
  aliases?: string[];
  unit?: string;
  minStock?: number;
  trackingMode?: TrackingMode;
}

export async function addProduct(db: Queryable, input: AddProductInput): Promise<Product> {
  try {
    const result = await db.query<ProductRow>(
      `INSERT INTO products (warehouse_id, sku, name, aliases, unit, min_stock, tracking_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.warehouseId,
        input.sku.toUpperCase(),
        input.name,
        input.aliases ?? [],
        input.unit ?? 'pcs',
        input.minStock ?? 0,
        input.trackingMode ?? 'quantity',
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('insert into products did not return a row');
    return toProduct(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new UserFacingError('DUPLICATE_SKU', `SKU "${input.sku}" sudah terdaftar di gudang ini.`);
    }
    throw err;
  }
}

export interface UpdateProductInput {
  name?: string;
  unit?: string;
  minStock?: number;
  aliases?: string[];
}

export async function updateProduct(
  db: Queryable,
  warehouseId: string,
  sku: string,
  patch: UpdateProductInput,
): Promise<{ before: Product; after: Product }> {
  const before = await findProductBySku(db, warehouseId, sku);
  if (!before) {
    throw new UserFacingError('PRODUCT_NOT_FOUND', `SKU "${sku}" tidak ditemukan di gudang ini.`);
  }

  const setClauses: string[] = [];
  const values: unknown[] = [warehouseId, before.sku];

  if (patch.name !== undefined) {
    values.push(patch.name);
    setClauses.push(`name = $${values.length}`);
  }
  if (patch.unit !== undefined) {
    values.push(patch.unit);
    setClauses.push(`unit = $${values.length}`);
  }
  if (patch.minStock !== undefined) {
    values.push(patch.minStock);
    setClauses.push(`min_stock = $${values.length}`);
  }
  if (patch.aliases !== undefined) {
    values.push(patch.aliases);
    setClauses.push(`aliases = $${values.length}`);
  }

  if (setClauses.length === 0) {
    return { before, after: before };
  }

  const result = await db.query<ProductRow>(
    `UPDATE products SET ${setClauses.join(', ')} WHERE warehouse_id = $1 AND sku = $2 RETURNING *`,
    values,
  );
  const row = result.rows[0];
  if (!row) throw new Error('update on products did not return a row');
  return { before, after: toProduct(row) };
}

export async function deactivateProduct(
  db: Queryable,
  warehouseId: string,
  sku: string,
): Promise<{ before: Product; after: Product }> {
  const before = await findProductBySku(db, warehouseId, sku);
  if (!before) {
    throw new UserFacingError('PRODUCT_NOT_FOUND', `SKU "${sku}" tidak ditemukan di gudang ini.`);
  }
  if (!before.isActive) {
    throw new UserFacingError('PRODUCT_ALREADY_INACTIVE', `SKU "${sku}" sudah nonaktif.`);
  }

  const result = await db.query<ProductRow>(
    `UPDATE products SET is_active = false WHERE warehouse_id = $1 AND sku = $2 RETURNING *`,
    [warehouseId, before.sku],
  );
  const row = result.rows[0];
  if (!row) throw new Error('update on products did not return a row');
  return { before, after: toProduct(row) };
}

export async function searchProducts(
  db: Queryable,
  warehouseId: string,
  keyword: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Product[]> {
  const activeClause = opts.activeOnly ? 'AND is_active = true' : '';
  const result = await db.query<ProductRow>(
    `SELECT * FROM products
     WHERE warehouse_id = $1 ${activeClause}
       AND (sku ILIKE $2 OR name ILIKE $2 OR EXISTS (
         SELECT 1 FROM unnest(aliases) alias WHERE alias ILIKE $2
       ))
     ORDER BY name
     LIMIT 50`,
    [warehouseId, `%${keyword}%`],
  );
  return result.rows.map(toProduct);
}

export async function listProducts(
  db: Queryable,
  warehouseId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Product[]> {
  const activeOnly = opts.activeOnly ?? true;
  const clause = activeOnly ? 'AND is_active = true' : '';
  const result = await db.query<ProductRow>(
    `SELECT * FROM products WHERE warehouse_id = $1 ${clause} ORDER BY name LIMIT 200`,
    [warehouseId],
  );
  return result.rows.map(toProduct);
}
