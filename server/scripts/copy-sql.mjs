import { cp } from 'node:fs/promises';
await cp(new URL('../sql/', import.meta.url), new URL('../dist/server/sql/', import.meta.url), { recursive: true });
