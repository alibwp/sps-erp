// Demo finance figures shared by the dashboards, so the school and accountant
// views tell the same story until the backend supplies real numbers.

/** Fees billed and collected over the last six months. */
export const FEES_BY_MONTH = [
  { month: "Jun", billed: 4200000, collected: 3600000 },
  { month: "Jul", billed: 4150000, collected: 3900000 },
  { month: "Aug", billed: 4300000, collected: 4050000 },
  { month: "Sep", billed: 4380000, collected: 3820000 },
  { month: "Oct", billed: 4400000, collected: 4100000 },
  { month: "Nov", billed: 4420000, collected: 2650000 },
];

/** What families still owe, by how late it is. The first bucket is not late. */
export const OWED_BY_LATENESS = [
  { label: "Not yet due", owed: 1240000 },
  { label: "1–30 days late", owed: 610000 },
  { label: "31–60 days late", owed: 285000 },
  { label: "Over 60 days", owed: 120000 },
];

/** Money received (fees and cash deposits) and spent (expenses) by month. */
export const CASH_BY_MONTH = [
  { month: "Jun", received: 3650000, spent: 3120000 },
  { month: "Jul", received: 3940000, spent: 3480000 },
  { month: "Aug", received: 4110000, spent: 3560000 },
  { month: "Sep", received: 3860000, spent: 4020000 },
  { month: "Oct", received: 4150000, spent: 3610000 },
  { month: "Nov", received: 2700000, spent: 2240000 },
];
