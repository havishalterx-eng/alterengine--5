import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one real Postgres database. Concurrent files
    // would race on schema DDL and truncate each other's tables, so run files
    // sequentially.
    fileParallelism: false,
  },
});
