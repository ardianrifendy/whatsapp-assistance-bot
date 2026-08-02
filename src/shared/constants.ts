export const TIMEZONE = 'Asia/Jakarta';

export const MOVEMENT_TYPES = ['MASUK', 'DI_JALAN', 'TERIMA', 'KELUAR', 'KOREKSI', 'BATAL'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const HELP_ASSET_FILES = [
  'help-main.png',
  'help-stock.png',
  'help-transaction.png',
  'help-in-transit.png',
  'help-history.png',
  'help-admin.png',
  'help-confirmation.png',
] as const;
