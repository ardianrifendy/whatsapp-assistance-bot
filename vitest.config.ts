import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      OWNER_WHATSAPP_NUMBER: '628000000000',
      NODE_ENV: 'test',
    },
  },
});
