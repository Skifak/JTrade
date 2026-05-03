import { defineConfig } from 'vitest/config';

/** Юнит-тесты без браузера — только pure JS из `src/lib`. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    pool: 'forks'
  }
});
