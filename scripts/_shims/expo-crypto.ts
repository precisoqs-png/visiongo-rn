// Test-only shim for verify-unify-migration.ts (see scripts/tsconfig.verify.json).
// The real `expo-crypto` package transitively imports React Native, whose
// Flow syntax `tsx`'s esbuild-based loader cannot parse — this script only
// ever needs Crypto.randomUUID(), which Node provides natively.
import { randomUUID } from 'node:crypto';
export { randomUUID };
