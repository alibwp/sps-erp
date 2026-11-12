import { AppendOnlyGuard1793830000000 } from './1793830000000-AppendOnlyGuard.js';
import { Identity1793919126688 } from './1793919126688-Identity.js';

// Every migration, oldest first. Add each new migration file here; a unit
// test fails when a file in this folder is missing from the list.
export const migrations = [AppendOnlyGuard1793830000000, Identity1793919126688];
