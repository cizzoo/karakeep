# Problema: transazioni async incompatibili con better-sqlite3

Nel branch `feat/todo-list`, le dipendenze `better-sqlite3` sono state aggiornate da `^11.3.0` a `^13.0.3` in `apps/web/package.json`, `apps/workers/package.json` e `packages/db/package.json`. Il driver `better-sqlite3` di drizzle-orm richiede che le callback passate a `db.transaction(...)` siano **sincrone**: il file `node_modules/better-sqlite3/lib/methods/transaction.js` lancia `TypeError: Transaction function cannot return a promise` se la funzione ritorna una Promise.

Nel codebase esistono però diverse chiamate `db.transaction(async (tx) => {...})` con callback `async` (che ritornano sempre una Promise). Esempi: in `packages/trpc/models/todoLists.repo.ts` nei metodi `updateTags`, `updateItemTags`, `reorderItems` e in `packages/trpc/routers/bookmarks.ts`. Questo mismatch è la causa più probabile dei 16 test falliti su 25 in `packages/trpc/routers/todoLists.test.ts`, con l'errore `Transaction function cannot return a promise`, non un problema ambientale generico.

## File coinvolti

- `apps/web/package.json`
- `apps/workers/package.json`
- `packages/db/package.json`
- `packages/trpc/models/todoLists.repo.ts`
- `packages/trpc/routers/bookmarks.ts`
- `packages/trpc/routers/todoLists.test.ts`
- `node_modules/better-sqlite3/lib/methods/transaction.js`
- `node_modules/drizzle-orm/better-sqlite3/session.js`

## Nota

Il problema non è stato ancora risolto e va indagato/sistemato separatamente: rendere sincrone le callback di transazione oppure valutare se il bump di better-sqlite3 a v13 è necessario/voluto.
