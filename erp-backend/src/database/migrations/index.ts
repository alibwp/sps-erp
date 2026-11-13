import { AppendOnlyGuard1793830000000 } from './1793830000000-AppendOnlyGuard.js';
import { Identity1793919126688 } from './1793919126688-Identity.js';
import { OrganizationsAndAccess1794140000000 } from './1794140000000-OrganizationsAndAccess.js';
import { SeedPermissions1794140000001 } from './1794140000001-SeedPermissions.js';
import { AcademicCalendar1794150000000 } from './1794150000000-AcademicCalendar.js';
import { SeedWeekdays1794150000001 } from './1794150000001-SeedWeekdays.js';
import { Curriculum1794160000000 } from './1794160000000-Curriculum.js';
import { Enrollments1794170000000 } from './1794170000000-Enrollments.js';
import { DemoAccounts1794180000000 } from './1794180000000-DemoAccounts.js';

// Every migration, oldest first. Add each new migration file here; a unit
// test fails when a file in this folder is missing from the list.
export const migrations = [
  AppendOnlyGuard1793830000000,
  Identity1793919126688,
  OrganizationsAndAccess1794140000000,
  SeedPermissions1794140000001,
  AcademicCalendar1794150000000,
  SeedWeekdays1794150000001,
  Curriculum1794160000000,
  Enrollments1794170000000,
  DemoAccounts1794180000000,
];
