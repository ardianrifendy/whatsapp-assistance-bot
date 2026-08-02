/** Base class for all app errors that carry a stable machine-readable code. */
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

/**
 * Error whose `message` is safe to send back to the WhatsApp group as-is
 * (already in friendly Indonesian). Anything else thrown during dispatch
 * is logged and replaced with a generic failure message before replying,
 * so internal details never leak to a chat.
 */
export class UserFacingError extends AppError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'UserFacingError';
  }
}

export class AccessDeniedError extends UserFacingError {
  constructor(message = 'Anda tidak memiliki akses untuk perintah ini.') {
    super('ACCESS_DENIED', message);
    this.name = 'AccessDeniedError';
  }
}

export class InsufficientStockError extends UserFacingError {
  constructor(message = 'Stok tidak mencukupi untuk transaksi ini.') {
    super('INSUFFICIENT_STOCK', message);
    this.name = 'InsufficientStockError';
  }
}
