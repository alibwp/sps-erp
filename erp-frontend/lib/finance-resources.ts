// The accountant's finance screens: expenses, payroll, budgets, the student
// fee views and the finance reports. Like every resource, each one reads its
// rows from deterministic demo data until the backend finance module exists;
// wiring a screen later means replacing its `rows` with an API call.
//
// The figures are built from one staff list and one set of salary rules, so
// a person's pay agrees across payroll runs, payslips, payments and tax.

import {
  CLASSES,
  DEMO_TODAY,
  PARENT_NAMES,
  SECTIONS,
  STAFF_NAMES,
  STUDENT_NAMES,
  TEACHER_NAMES,
  createRandom,
  rows,
  shiftDate,
} from "@/lib/mock";
import type { Resource, Row } from "@/lib/resources";
import { formatMoney } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared lists
// ---------------------------------------------------------------------------

/** Budget accounts, matching the Budgets screen. */
const BUDGET_ACCOUNTS = [
  "Salaries", "Utilities", "Library books", "Science labs",
  "Sports equipment", "Building maintenance", "IT & computers", "Events",
];

/** Expense heads; the first six match the Expenses screen's accounts. */
const EXPENSE_HEADS = [
  "Utilities", "Science labs", "IT & computers", "Sports equipment", "Building maintenance",
  "Library books", "Stationery", "Transport fuel", "Events",
];

/** Vendors; the first five match the Expenses screen's payees. */
const VENDORS = [
  "IESCO", "Al-Noor Traders", "PTCL", "City Stationers", "Rawal Supplies",
  "SNGPL", "Pak Fuel Station", "Book Point",
];

/** Banks, matching the Cash deposits screen. */
const BANKS = ["HBL — Saddar", "Askari Bank — Cantt", "Meezan Bank — Mall Road"];

const DEPARTMENTS = ["Academics", "Administration", "Finance", "Library", "Transport", "Health", "IT"];

const PAYMENT_MODES = ["Cash", "Bank transfer", "Online", "Cheque"];

const ACCOUNTANT = "Kamran Butt";
const ADMINISTRATOR = "Adil Mehmood";
const PRINCIPAL = TEACHER_NAMES[0];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const r10 = (amount: number) => Math.round(amount / 10) * 10;
const sum = (list: Row[], key: string) => list.reduce((total, row) => total + Number(row[key] ?? 0), 0);
const countWhere = (list: Row[], key: string, value: string) => list.filter((row) => row[key] === value).length;

function withIds<T extends Record<string, unknown>>(items: T[]): Array<T & { id: string }> {
  return items.map((item, index) => ({ id: String(index + 1), ...item }));
}

// ---------------------------------------------------------------------------
// Staff and pay
// ---------------------------------------------------------------------------

type StaffGroup = "Teaching staff" | "Support staff";

type StaffMember = {
  name: string;
  employeeNo: string;
  designation: string;
  department: string;
  grade: string;
  basic: number;
  group: StaffGroup;
  index: number;
};

const SUPPORT_POSTS: Array<[designation: string, department: string, grade: string, basic: number]> = [
  ["Accountant", "Finance", "BPS-16", 95000],
  ["Cashier", "Finance", "BPS-11", 58000],
  ["Office clerk", "Administration", "BPS-11", 52000],
  ["Librarian", "Library", "BPS-14", 68000],
  ["Lab assistant", "Academics", "BPS-9", 45000],
  ["IT officer", "IT", "BPS-16", 92000],
  ["Nurse", "Health", "BPS-14", 70000],
  ["Driver", "Transport", "BPS-6", 40000],
  ["Driver", "Transport", "BPS-6", 40000],
  ["Security guard", "Administration", "BPS-4", 37000],
  ["Office assistant", "Administration", "BPS-4", 37000],
  ["Admin officer", "Administration", "BPS-17", 110000],
];

const STAFF: StaffMember[] = [
  ...TEACHER_NAMES.map((name, i): Omit<StaffMember, "index"> => ({
    name,
    employeeNo: `EMP-${String(101 + i)}`,
    designation: i === 0 ? "Principal" : i < 4 ? "Senior teacher" : "Teacher",
    department: "Academics",
    grade: i === 0 ? "BPS-20" : i < 4 ? "BPS-18" : i % 2 === 0 ? "BPS-17" : "BPS-16",
    basic: i === 0 ? 240000 : i < 4 ? 125000 + i * 4000 : 80000 + (i % 6) * 5000,
    group: "Teaching staff",
  })),
  ...STAFF_NAMES.map((name, i): Omit<StaffMember, "index"> => {
    const [designation, department, grade, basic] = SUPPORT_POSTS[i % SUPPORT_POSTS.length];
    return { name, employeeNo: `EMP-${String(201 + i)}`, designation, department, grade, basic, group: "Support staff" };
  }),
].map((member, index) => ({ ...member, index }));

const STAFF_NAME_LIST = STAFF.map((member) => member.name);

/**
 * Monthly income tax from the salaried-person slabs (demo figures shaped on
 * Pakistan's salaried slabs). The medical allowance is treated as exempt.
 */
function monthlyTax(taxableMonthly: number): number {
  const annual = taxableMonthly * 12;
  let tax = 0;
  if (annual > 4100000) tax = 616000 + (annual - 4100000) * 0.35;
  else if (annual > 3200000) tax = 346000 + (annual - 3200000) * 0.3;
  else if (annual > 2200000) tax = 116000 + (annual - 2200000) * 0.23;
  else if (annual > 1200000) tax = 6000 + (annual - 1200000) * 0.11;
  else if (annual > 600000) tax = (annual - 600000) * 0.01;
  return r10(tax / 12);
}

/** One person's pay for one month (monthIndex 0 = the newest month). */
function payFor(member: StaffMember, monthIndex: number) {
  const houseRent = r10(member.basic * 0.45);
  const medical = r10(member.basic * 0.1);
  const conveyance = 5000;
  const allowances = houseRent + medical + conveyance;
  const gross = member.basic + allowances;

  const providentFund = r10(member.basic * 0.0833);
  const eobi = 370;
  const tax = monthlyTax(gross - medical);
  const leaveSeed = (member.index * 7 + monthIndex * 3) % 11;
  const leaveDays = leaveSeed === 2 ? 2 : leaveSeed === 5 ? 1 : 0;
  const unpaidLeave = r10((member.basic / 30) * leaveDays);
  const advance = member.index % 9 === 4 ? 10000 : 0;
  const deductions = providentFund + eobi + tax + unpaidLeave + advance;

  return { houseRent, medical, conveyance, allowances, gross, providentFund, eobi, tax, leaveDays, unpaidLeave, advance, deductions, net: gross - deductions };
}

const PAY_MONTHS = [
  { key: "2026-11", label: "November 2026", short: "Nov 2026", payDate: "2026-11-30" },
  { key: "2026-10", label: "October 2026", short: "Oct 2026", payDate: "2026-10-31" },
  { key: "2026-09", label: "September 2026", short: "Sep 2026", payDate: "2026-09-30" },
  { key: "2026-08", label: "August 2026", short: "Aug 2026", payDate: "2026-08-31" },
];

const runReference = (monthKey: string, group: StaffGroup) => `PAY-${monthKey}-${group === "Teaching staff" ? "T" : "S"}`;

/** Where each payroll run stands. November is still being worked on. */
function runStatus(monthIndex: number, group: StaffGroup): string {
  if (monthIndex > 0) return "Paid";
  return group === "Teaching staff" ? "Generated" : "Draft";
}

const WORKING_DAYS = 26;

// ===========================================================================
// Expenses
// ===========================================================================

const expenseHeadRows = rows(301, EXPENSE_HEADS.length, (i, r) => ({
  name: EXPENSE_HEADS[i],
  code: `EXP-${String(510 + i * 10)}`,
  group: ["Operations", "Academic", "Academic", "Academic", "Facilities", "Academic", "Operations", "Operations", "Activities"][i],
  budgetAccount: ["Utilities", "Science labs", "IT & computers", "Sports equipment", "Building maintenance", "Library books", "Building maintenance", "Utilities", "Events"][i],
  spent: r.money(60000, 1400000, 5000),
  entries: r.int(4, 46),
  status: i === 8 ? "Inactive" : "Active",
}));

const vendorRows = rows(302, VENDORS.length, (i, r) => ({
  name: VENDORS[i],
  category: ["Utilities", "Lab supplies", "Utilities", "Stationery", "General supplies", "Utilities", "Fuel", "Books"][i],
  contact: ["Billing desk", "Naveed Akhtar", "Corporate desk", "Shahid Iqbal", "Asif Rana", "Billing desk", "Tariq Mehmood", "Faisal Javed"][i],
  phone: r.phone(),
  ntn: `${r.int(1000000, 9999999)}-${r.int(1, 9)}`,
  paid: r.money(80000, 2200000, 5000),
  outstanding: i % 3 === 1 ? r.money(15000, 160000, 500) : 0,
  status: i === 7 ? "Inactive" : "Active",
}));

const purchaseRequestRows = rows(303, 14, (i, r) => ({
  reference: `PR-2026-${String(41 + i).padStart(3, "0")}`,
  item: r.pick([
    "Projector for Class 9 A", "Chemistry lab glassware", "Cricket kits (2 sets)", "Library shelving unit",
    "Printer cartridges (box of 10)", "Whiteboard markers", "Ceiling fans for Block B", "UPS batteries",
    "Annual day stage décor", "First aid supplies",
  ]),
  requestedBy: TEACHER_NAMES[(i * 3) % TEACHER_NAMES.length],
  department: r.pick(["Academics", "Administration", "IT", "Library", "Health"]),
  head: r.pick(EXPENSE_HEADS),
  estimate: r.money(4000, 240000, 500),
  needed: r.date(2, 40),
  status: ["Pending", "Approved", "Converted to expense", "Rejected", "Pending", "Approved"][i % 6],
}));

const recurringRows = rows(304, 9, (i, r) => ({
  name: ["Electricity — main block", "Gas connection", "Internet (100 Mbps)", "Security contract", "Generator maintenance", "Water tanker supply", "Software licences", "Pest control", "Bus lease — Route A"][i],
  vendor: ["IESCO", "SNGPL", "PTCL", "Rawal Supplies", "Al-Noor Traders", "Rawal Supplies", "City Stationers", "Al-Noor Traders", "Pak Fuel Station"][i],
  head: ["Utilities", "Utilities", "IT & computers", "Building maintenance", "Building maintenance", "Utilities", "IT & computers", "Building maintenance", "Transport fuel"][i],
  amount: [185000, 42000, 18500, 96000, 25000, 14000, 60000, 12000, 110000][i],
  frequency: ["Monthly", "Monthly", "Monthly", "Monthly", "Quarterly", "Monthly", "Yearly", "Quarterly", "Monthly"][i],
  nextDue: r.date(1, 45),
  autoPost: i % 4 === 3 ? "No" : "Yes",
  status: i === 7 ? "Paused" : "Active",
}));

const pettyCashRows = (() => {
  const random = createRandom(305);
  let balance = 0;
  return withIds(
    Array.from({ length: 18 }, (_, i) => {
      const topUp = i % 6 === 0;
      const amount = topUp ? 50000 : random.money(300, 6500, 50);
      balance += topUp ? amount : -amount;
      return {
        reference: `PC-${String(301 + i)}`,
        date: shiftDate(DEMO_TODAY, -40 + i * 2),
        description: topUp
          ? "Top-up from main cash"
          : random.pick(["Tea and refreshments", "Courier charges", "Photocopies", "Plumber visit", "Light bulbs", "Taxi for bank deposit", "Batteries", "Cleaning supplies"]),
        kind: topUp ? "Top-up" : "Spend",
        amount,
        balance,
        handledBy: ACCOUNTANT,
        status: i > 13 ? "Unreconciled" : "Reconciled",
      };
    }),
  ).reverse();
})();

const bankAccountRows = rows(306, BANKS.length + 1, (i, r) => {
  const book = r.money(900000, 6800000, 1000);
  const difference = i === 1 ? 18500 : i === 3 ? -4200 : 0;
  return {
    name: [...BANKS, "Meezan Bank — Payroll"][i],
    title: ["SPS Army School — Fees", "SPS Army School — Operations", "SPS Army School — Collections", "SPS Army School — Salaries"][i],
    number: `•••• ${r.int(1000, 9999)}`,
    type: i === 3 ? "Payroll" : i === 1 ? "Current" : "Collection",
    book,
    bank: book + difference,
    difference,
    reconciled: r.date(-35, -2),
    status: difference === 0 ? "Reconciled" : "Unreconciled",
  };
});

const expensesModule: Resource[] = [
  {
    slug: "expense-heads",
    title: "Expense heads",
    singular: "Expense head",
    description: "The categories spending is recorded under, each tied to a budget account.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Head" },
      { key: "code", label: "Code", kind: "mono" },
      { key: "group", label: "Group" },
      { key: "budgetAccount", label: "Budget account" },
      { key: "spent", label: "Spent this year", kind: "money" },
      { key: "entries", label: "Entries", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: expenseHeadRows,
    stats: [
      { label: "Expense heads", value: String(expenseHeadRows.length) },
      { label: "Active", value: String(countWhere(expenseHeadRows, "status", "Active")) },
      { label: "Spent this year", value: formatMoney(sum(expenseHeadRows, "spent")) },
    ],
    form: [{ title: "Expense head", fields: [
      { name: "name", label: "Name", required: true, placeholder: "Stationery" },
      { name: "code", label: "Code", placeholder: "EXP-580" },
      { name: "group", label: "Group", type: "select", options: ["Operations", "Academic", "Facilities", "Activities"] },
      { name: "parent", label: "Sub-head of (optional)", type: "select", options: EXPENSE_HEADS },
      { name: "budgetAccount", label: "Budget account", type: "select", options: BUDGET_ACCOUNTS },
      { name: "description", label: "Description", type: "textarea", wide: true },
    ] }],
    createLabel: "Add expense head",
    related: [{ slug: "expenses", matchKey: "account", title: "Expenses under this head" }],
  },
  {
    slug: "vendors",
    title: "Vendors",
    singular: "Vendor",
    description: "The suppliers and service providers the school pays, and what is still owed to them.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Vendor" },
      { key: "category", label: "Supplies" },
      { key: "contact", label: "Contact" },
      { key: "phone", label: "Phone" },
      { key: "ntn", label: "NTN", kind: "mono", detailOnly: true },
      { key: "paid", label: "Paid this year", kind: "money" },
      { key: "outstanding", label: "Outstanding", kind: "money" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: vendorRows,
    stats: [
      { label: "Vendors", value: String(vendorRows.length) },
      { label: "Paid this year", value: formatMoney(sum(vendorRows, "paid")) },
      { label: "Owed to vendors", value: formatMoney(sum(vendorRows, "outstanding")) },
    ],
    form: [
      { title: "Vendor", fields: [
        { name: "name", label: "Business name", required: true },
        { name: "category", label: "Supplies", type: "select", options: ["Utilities", "Lab supplies", "Stationery", "General supplies", "Fuel", "Books", "Services"] },
        { name: "contact", label: "Contact person" },
        { name: "phone", label: "Phone", type: "tel" },
        { name: "email", label: "Email", type: "email" },
        { name: "address", label: "Address", wide: true },
      ] },
      { title: "Tax and payment", fields: [
        { name: "ntn", label: "NTN", placeholder: "1234567-8" },
        { name: "strn", label: "Sales tax number (optional)" },
        { name: "bank", label: "Bank and branch" },
        { name: "iban", label: "IBAN", placeholder: "PK36 SCBL 0000 0011 2345 6702" },
      ] },
    ],
    createLabel: "Add vendor",
    related: [{ slug: "expenses", matchKey: "payee", title: "Payments to this vendor" }],
  },
  {
    slug: "purchase-requests",
    title: "Purchase requests",
    singular: "Purchase request",
    description: "Requests to buy something, approved before the money is spent and then recorded as an expense.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Request", kind: "mono" },
      { key: "item", label: "Item" },
      { key: "requestedBy", label: "Requested by", kind: "person", sub: "department" },
      { key: "department", label: "Department", detailOnly: true },
      { key: "head", label: "Expense head" },
      { key: "estimate", label: "Estimate", kind: "money" },
      { key: "needed", label: "Needed by", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: purchaseRequestRows,
    stats: [
      { label: "Waiting for approval", value: String(countWhere(purchaseRequestRows, "status", "Pending")) },
      { label: "Approved, not yet bought", value: String(countWhere(purchaseRequestRows, "status", "Approved")) },
      { label: "Committed", value: formatMoney(sum(purchaseRequestRows.filter((row) => row.status === "Approved"), "estimate")) },
    ],
    form: [{ title: "Request a purchase", fields: [
      { name: "item", label: "What is needed", required: true, wide: true },
      { name: "department", label: "Department", type: "select", options: DEPARTMENTS },
      { name: "head", label: "Expense head", type: "select", options: EXPENSE_HEADS },
      { name: "estimate", label: "Estimated cost (Rs)", type: "number" },
      { name: "needed", label: "Needed by", type: "date" },
      { name: "vendor", label: "Preferred vendor (optional)", type: "select", options: VENDORS },
      { name: "quote", label: "Quotation", type: "file" },
      { name: "reason", label: "Why it is needed", type: "textarea", wide: true },
    ] }],
    createLabel: "New purchase request",
  },
  {
    slug: "recurring-expenses",
    title: "Recurring expenses",
    singular: "Recurring expense",
    description: "Bills that come back on a schedule, recorded automatically when they fall due.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Expense" },
      { key: "vendor", label: "Vendor" },
      { key: "head", label: "Expense head" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "frequency", label: "Repeats" },
      { key: "nextDue", label: "Next due", kind: "date" },
      { key: "autoPost", label: "Record automatically" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: recurringRows,
    stats: [
      { label: "Active schedules", value: String(countWhere(recurringRows, "status", "Active")) },
      { label: "Monthly commitment", value: formatMoney(sum(recurringRows.filter((row) => row.frequency === "Monthly"), "amount")) },
    ],
    form: [{ title: "Recurring expense", fields: [
      { name: "name", label: "Name", required: true },
      { name: "vendor", label: "Vendor", type: "select", options: VENDORS },
      { name: "head", label: "Expense head", type: "select", options: EXPENSE_HEADS },
      { name: "amount", label: "Amount (Rs)", type: "number" },
      { name: "frequency", label: "Repeats", type: "select", options: ["Monthly", "Quarterly", "Yearly"] },
      { name: "nextDue", label: "First due date", type: "date" },
      { name: "endsOn", label: "Ends on (optional)", type: "date" },
      { name: "autoPost", label: "Record the expense automatically when due", type: "checkbox", wide: true },
    ] }],
    createLabel: "Add recurring expense",
  },
  {
    slug: "petty-cash",
    title: "Petty cash",
    singular: "Petty cash entry",
    description: "Small day-to-day cash spending, kept in its own book and reconciled against the cash box.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Entry", kind: "mono" },
      { key: "date", label: "Date", kind: "date" },
      { key: "description", label: "Description" },
      { key: "kind", label: "Type" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "balance", label: "Balance after", kind: "money" },
      { key: "handledBy", label: "Handled by", detailOnly: true },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: pettyCashRows,
    stats: [
      { label: "Cash in hand", value: formatMoney(Number(pettyCashRows[0]?.balance ?? 0)) },
      { label: "Spent this period", value: formatMoney(sum(pettyCashRows.filter((row) => row.kind === "Spend"), "amount")) },
      { label: "Unreconciled entries", value: String(countWhere(pettyCashRows, "status", "Unreconciled")) },
    ],
    form: [{ title: "Petty cash entry", fields: [
      { name: "kind", label: "Type", type: "select", options: ["Spend", "Top-up"], required: true },
      { name: "date", label: "Date", type: "date" },
      { name: "amount", label: "Amount (Rs)", type: "number" },
      { name: "head", label: "Expense head", type: "select", options: EXPENSE_HEADS },
      { name: "description", label: "Description", wide: true },
      { name: "receipt", label: "Receipt (optional)", type: "file" },
    ] }],
    createLabel: "Record petty cash",
  },
  {
    slug: "bank-accounts",
    title: "Bank accounts",
    singular: "Bank account",
    description: "The school's bank accounts, their balances, and whether the books agree with the bank.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Bank" },
      { key: "title", label: "Account title" },
      { key: "number", label: "Account no.", kind: "mono" },
      { key: "type", label: "Used for" },
      { key: "book", label: "Book balance", kind: "money" },
      { key: "bank", label: "Bank balance", kind: "money" },
      { key: "difference", label: "Difference", kind: "money" },
      { key: "reconciled", label: "Last reconciled", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: bankAccountRows,
    stats: [
      { label: "Total in bank", value: formatMoney(sum(bankAccountRows, "bank")) },
      { label: "Accounts to reconcile", value: String(countWhere(bankAccountRows, "status", "Unreconciled")) },
    ],
    form: [{ title: "Bank account", fields: [
      { name: "name", label: "Bank and branch", required: true },
      { name: "title", label: "Account title" },
      { name: "iban", label: "IBAN" },
      { name: "type", label: "Used for", type: "select", options: ["Collection", "Current", "Payroll", "Savings"] },
      { name: "opening", label: "Opening balance (Rs)", type: "number" },
      { name: "statement", label: "Upload statement to reconcile", type: "file" },
    ] }],
    createLabel: "Add bank account",
    related: [{ slug: "cash-deposits", matchKey: "bank", title: "Deposits into this account" }],
  },
];

// ===========================================================================
// Payroll
// ===========================================================================

const payrollRunRows = withIds(
  PAY_MONTHS.flatMap((month, monthIndex) =>
    (["Teaching staff", "Support staff"] as const).map((group) => {
      const members = STAFF.filter((member) => member.group === group);
      const pays = members.map((member) => payFor(member, monthIndex));
      return {
        reference: runReference(month.key, group),
        month: month.label,
        group,
        staff: members.length,
        gross: pays.reduce((total, pay) => total + pay.gross, 0),
        deductions: pays.reduce((total, pay) => total + pay.deductions, 0),
        net: pays.reduce((total, pay) => total + pay.net, 0),
        payDate: month.payDate,
        status: runStatus(monthIndex, group),
      };
    }),
  ),
);

const payrollSheetRows = withIds(
  PAY_MONTHS.slice(0, 2).flatMap((month, monthIndex) =>
    STAFF.map((member) => {
      const pay = payFor(member, monthIndex);
      const status = runStatus(monthIndex, member.group);
      return {
        staff: member.name,
        designation: member.designation,
        run: runReference(month.key, member.group),
        month: month.label,
        basic: member.basic,
        allowances: pay.allowances,
        deductions: pay.deductions,
        net: pay.net,
        attendance: `${WORKING_DAYS - pay.leaveDays}/${WORKING_DAYS} days`,
        status: status === "Draft" ? "Not generated" : status,
      };
    }),
  ),
);

const salaryStructureRows = withIds(
  STAFF.map((member) => {
    const pay = payFor(member, 0);
    return {
      staff: member.name,
      designation: member.designation,
      employeeNo: member.employeeNo,
      grade: member.grade,
      basic: member.basic,
      houseRent: pay.houseRent,
      medical: pay.medical,
      conveyance: pay.conveyance,
      gross: pay.gross,
      effective: "2026-07-01",
      status: "Active",
    };
  }),
);

const payrollComponentRows = withIds([
  { name: "Basic pay", kind: "Earning", calculation: "Set per pay grade", taxable: "Yes", appliesTo: "All staff", status: "Active" },
  { name: "House rent allowance", kind: "Earning", calculation: "45% of basic", taxable: "Yes", appliesTo: "All staff", status: "Active" },
  { name: "Medical allowance", kind: "Earning", calculation: "10% of basic", taxable: "No", appliesTo: "All staff", status: "Active" },
  { name: "Conveyance allowance", kind: "Earning", calculation: "Fixed Rs 5,000", taxable: "Yes", appliesTo: "All staff", status: "Active" },
  { name: "Senior teacher allowance", kind: "Earning", calculation: "Fixed Rs 8,000", taxable: "Yes", appliesTo: "Senior teachers", status: "Active" },
  { name: "Overtime", kind: "Earning", calculation: "Hours × hourly rate", taxable: "Yes", appliesTo: "Support staff", status: "Active" },
  { name: "Performance bonus", kind: "Earning", calculation: "One-time amount", taxable: "Yes", appliesTo: "Chosen staff", status: "Active" },
  { name: "Provident fund", kind: "Deduction", calculation: "8.33% of basic", taxable: "—", appliesTo: "All staff", status: "Active" },
  { name: "EOBI", kind: "Deduction", calculation: "Fixed Rs 370", taxable: "—", appliesTo: "All staff", status: "Active" },
  { name: "Income tax", kind: "Deduction", calculation: "Salaried tax slabs", taxable: "—", appliesTo: "All staff", status: "Active" },
  { name: "Unpaid leave", kind: "Deduction", calculation: "Basic ÷ 30 × days", taxable: "—", appliesTo: "All staff", status: "Active" },
  { name: "Advance recovery", kind: "Deduction", calculation: "Instalment from advance", taxable: "—", appliesTo: "Staff with advances", status: "Active" },
  { name: "Loan instalment", kind: "Deduction", calculation: "Instalment from loan", taxable: "—", appliesTo: "Staff with loans", status: "Active" },
  { name: "Late arrival fine", kind: "Deduction", calculation: "Rs 200 per late mark", taxable: "—", appliesTo: "All staff", status: "Paused" },
]);

const advanceRows = rows(311, 9, (i, r) => {
  const member = STAFF[(i * 5 + 4) % STAFF.length];
  const loan = i % 3 === 2;
  const amount = loan ? r.money(150000, 400000, 10000) : r.money(20000, 60000, 5000);
  const instalments = loan ? 12 : 3;
  const instalment = r10(amount / instalments);
  const paidInstalments = i === 0 ? 0 : i === 5 ? instalments : r.int(1, instalments - 1);
  const recovered = Math.min(amount, instalment * paidInstalments);
  return {
    reference: `ADV-${String(71 + i).padStart(3, "0")}`,
    staff: member.name,
    designation: member.designation,
    type: loan ? "Staff loan" : "Salary advance",
    amount,
    instalment,
    recovered,
    balance: amount - recovered,
    starts: shiftDate("2026-06-01", i * 15),
    status: i === 0 ? "Requested" : recovered >= amount ? "Recovered" : "Recovering",
  };
});

const taxRows = withIds(
  STAFF.map((member) => {
    const pay = payFor(member, 0);
    const monthsSoFar = 5; // July to November of the tax year.
    return {
      staff: member.name,
      designation: member.designation,
      cnic: `37405-•••••••-${(member.index % 9) + 1}`,
      filer: member.index % 7 === 3 ? "Non-filer" : "Filer",
      taxable: (pay.gross - pay.medical) * 12,
      monthlyTax: pay.tax,
      taxToDate: pay.tax * monthsSoFar,
      providentFund: pay.providentFund * monthsSoFar,
      eobi: pay.eobi * monthsSoFar,
    };
  }),
);

const salaryPaymentRows = withIds(
  PAY_MONTHS.slice(1, 3).flatMap((month, offset) =>
    STAFF.map((member) => {
      const cash = ["Driver", "Security guard", "Office assistant"].includes(member.designation);
      const cheque = member.index === 9;
      return {
        reference: `SAL-${month.key.replace("-", "")}-${String(member.index + 1).padStart(3, "0")}`,
        staff: member.name,
        designation: member.designation,
        month: month.label,
        amount: payFor(member, offset + 1).net,
        mode: cash ? "Cash" : cheque ? "Cheque" : "Bank transfer",
        bank: cash ? null : "Meezan Bank — Payroll",
        paidOn: month.payDate,
        status: "Paid",
      };
    }),
  ),
);

const payslipRows = withIds(
  PAY_MONTHS.slice(1, 3).flatMap((month, offset) =>
    STAFF.map((member) => {
      const pay = payFor(member, offset + 1);
      return {
        number: `PS-${month.key.replace("-", "")}-${member.employeeNo.slice(4)}`,
        staff: member.name,
        designation: member.designation,
        month: month.label,
        gross: pay.gross,
        deductions: pay.deductions,
        net: pay.net,
        emailed: member.index % 11 === 6 ? "Not sent" : "Sent",
        status: "Paid",
      };
    }),
  ),
);

const arrearRows = rows(312, 8, (i, r) => {
  const member = STAFF[(i * 3 + 1) % STAFF.length];
  return {
    reference: `ARR-${String(21 + i).padStart(3, "0")}`,
    staff: member.name,
    designation: member.designation,
    type: ["Increment arrears", "Back-pay", "Correction", "Allowance revision"][i % 4],
    period: ["Jul–Sep 2026", "Aug 2026", "Oct 2026", "Jul–Oct 2026"][i % 4],
    amount: i % 4 === 2 ? -r.money(1000, 6000, 100) : r.money(4000, 36000, 500),
    payIn: i < 5 ? runReference("2026-11", member.group) : runReference("2026-10", member.group),
    status: i < 3 ? "Pending" : i < 5 ? "Approved" : "Paid",
  };
});

const settlementRows = rows(313, 4, (i, r) => {
  const salaryDue = r.money(40000, 160000, 500);
  const leaveEncashment = r.money(10000, 90000, 500);
  const providentFund = r.money(120000, 900000, 1000);
  const recoveries = i === 1 ? 30000 : r.money(0, 8000, 500);
  return {
    staff: ["Mr. Waqas Anwar", "Ms. Rabia Saleem", "Mr. Junaid Akram", "Mrs. Shazia Nawaz"][i],
    designation: ["Teacher", "Senior teacher", "Driver", "Office clerk"][i],
    lastDay: shiftDate(DEMO_TODAY, [-80, -36, -12, 18][i]),
    reason: ["Resignation", "Retirement", "Contract ended", "Resignation"][i],
    salaryDue,
    leaveEncashment,
    providentFund,
    recoveries,
    net: salaryDue + leaveEncashment + providentFund - recoveries,
    status: ["Paid", "Paid", "Approved", "Draft"][i],
  };
});

const latestRun = payrollRunRows.filter((row) => row.month === PAY_MONTHS[0].label);

const payrollModule: Resource[] = [
  {
    slug: "payroll-runs",
    title: "Payroll runs",
    singular: "Payroll run",
    description: "Each month's salary run for a staff group, from draft to approved to paid.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Run", kind: "mono" },
      { key: "month", label: "Month" },
      { key: "group", label: "Staff group" },
      { key: "staff", label: "Staff", kind: "number" },
      { key: "gross", label: "Gross", kind: "money" },
      { key: "deductions", label: "Deductions", kind: "money" },
      { key: "net", label: "Net pay", kind: "money" },
      { key: "payDate", label: "Pay date", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: payrollRunRows,
    stats: [
      { label: `Net payroll, ${PAY_MONTHS[0].label}`, value: formatMoney(sum(latestRun, "net")) },
      { label: "Staff on payroll", value: String(STAFF.length) },
      { label: "Runs not yet paid", value: String(payrollRunRows.filter((row) => row.status !== "Paid").length) },
    ],
    form: [{ title: "Start a payroll run", description: "Every active staff member in the group is added with their salary structure, attendance and leave.", fields: [
      { name: "month", label: "Month", type: "select", options: ["December 2026", ...PAY_MONTHS.map((month) => month.label)], required: true },
      { name: "group", label: "Staff group", type: "select", options: ["Teaching staff", "Support staff", "All staff"], required: true },
      { name: "payDate", label: "Pay date", type: "date" },
      { name: "account", label: "Pay from", type: "select", options: ["Meezan Bank — Payroll", ...BANKS] },
      { name: "note", label: "Note (optional)", type: "textarea", wide: true },
    ] }],
    createLabel: "Start payroll run",
    submitLabel: "Start run",
    related: [{ slug: "payroll-sheets", matchKey: "run", title: "Staff in this run" }],
  },
  {
    slug: "payroll-sheets",
    title: "Generate payroll",
    singular: "Payroll sheet",
    description: "Each staff member's pay for the month: attendance, earnings and deductions, ready to generate.",
    titleKey: "staff",
    columns: [
      { key: "staff", label: "Staff", kind: "person", sub: "designation" },
      { key: "designation", label: "Designation", detailOnly: true },
      { key: "run", label: "Run", kind: "mono" },
      { key: "month", label: "Month", detailOnly: true },
      { key: "attendance", label: "Attendance" },
      { key: "basic", label: "Basic", kind: "money" },
      { key: "allowances", label: "Allowances", kind: "money" },
      { key: "deductions", label: "Deductions", kind: "money" },
      { key: "net", label: "Net pay", kind: "money" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: payrollSheetRows,
    stats: [
      { label: "Not generated", value: String(countWhere(payrollSheetRows, "status", "Not generated")) },
      { label: "Generated, awaiting approval", value: String(countWhere(payrollSheetRows, "status", "Generated")) },
      { label: "Paid", value: String(countWhere(payrollSheetRows, "status", "Paid")) },
    ],
    form: [
      { title: "Staff and month", fields: [
        { name: "staff", label: "Staff member", type: "select", options: STAFF_NAME_LIST, required: true },
        { name: "month", label: "Month", type: "select", options: PAY_MONTHS.map((month) => month.label), required: true },
        { name: "daysWorked", label: "Days worked", type: "number", placeholder: String(WORKING_DAYS) },
        { name: "unpaidLeave", label: "Unpaid leave days", type: "number", placeholder: "0" },
      ] },
      { title: "Earnings", description: "Filled in from the salary structure; change them for this month only.", fields: [
        { name: "basic", label: "Basic pay (Rs)", type: "number" },
        { name: "houseRent", label: "House rent (Rs)", type: "number" },
        { name: "medical", label: "Medical (Rs)", type: "number" },
        { name: "conveyance", label: "Conveyance (Rs)", type: "number" },
        { name: "overtime", label: "Overtime (Rs)", type: "number" },
        { name: "bonus", label: "Bonus (Rs)", type: "number" },
      ] },
      { title: "Deductions", fields: [
        { name: "providentFund", label: "Provident fund (Rs)", type: "number" },
        { name: "eobi", label: "EOBI (Rs)", type: "number" },
        { name: "tax", label: "Income tax (Rs)", type: "number" },
        { name: "advance", label: "Advance or loan recovery (Rs)", type: "number" },
        { name: "otherDeduction", label: "Other deduction (Rs)", type: "number" },
        { name: "note", label: "Note on the payslip", type: "textarea", wide: true },
      ] },
    ],
    createLabel: "Generate payroll",
    submitLabel: "Calculate and save",
  },
  {
    slug: "salary-structures",
    title: "Salary structures",
    singular: "Salary structure",
    description: "Each staff member's pay grade, basic pay and standing allowances, used by every payroll run.",
    titleKey: "staff",
    columns: [
      { key: "staff", label: "Staff", kind: "person", sub: "designation" },
      { key: "designation", label: "Designation", detailOnly: true },
      { key: "employeeNo", label: "Employee no.", kind: "mono" },
      { key: "grade", label: "Grade" },
      { key: "basic", label: "Basic", kind: "money" },
      { key: "houseRent", label: "House rent", kind: "money" },
      { key: "medical", label: "Medical", kind: "money", detailOnly: true },
      { key: "conveyance", label: "Conveyance", kind: "money", detailOnly: true },
      { key: "gross", label: "Gross", kind: "money" },
      { key: "effective", label: "Effective from", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: salaryStructureRows,
    stats: [
      { label: "Monthly gross bill", value: formatMoney(sum(salaryStructureRows, "gross")) },
      { label: "Average gross", value: formatMoney(Math.round(sum(salaryStructureRows, "gross") / salaryStructureRows.length)) },
    ],
    form: [{ title: "Salary structure", fields: [
      { name: "staff", label: "Staff member", type: "select", options: STAFF_NAME_LIST, required: true },
      { name: "grade", label: "Pay grade", type: "select", options: ["BPS-4", "BPS-6", "BPS-9", "BPS-11", "BPS-14", "BPS-16", "BPS-17", "BPS-18", "BPS-20"] },
      { name: "basic", label: "Basic pay (Rs)", type: "number", required: true },
      { name: "houseRent", label: "House rent (% of basic)", type: "number", placeholder: "45" },
      { name: "medical", label: "Medical (% of basic)", type: "number", placeholder: "10" },
      { name: "conveyance", label: "Conveyance (Rs)", type: "number", placeholder: "5000" },
      { name: "effective", label: "Effective from", type: "date" },
      { name: "iban", label: "Salary account IBAN" },
    ] }],
    createLabel: "Add salary structure",
  },
  {
    slug: "payroll-components",
    title: "Allowances & deductions",
    singular: "Pay component",
    description: "The earnings and deductions payroll can use, and how each one is worked out.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Component" },
      { key: "kind", label: "Type", kind: "badge" },
      { key: "calculation", label: "Worked out as" },
      { key: "taxable", label: "Taxable" },
      { key: "appliesTo", label: "Applies to" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: payrollComponentRows,
    stats: [
      { label: "Earnings", value: String(countWhere(payrollComponentRows, "kind", "Earning")) },
      { label: "Deductions", value: String(countWhere(payrollComponentRows, "kind", "Deduction")) },
    ],
    form: [{ title: "Pay component", fields: [
      { name: "name", label: "Name", required: true },
      { name: "kind", label: "Type", type: "select", options: ["Earning", "Deduction"], required: true },
      { name: "method", label: "Worked out as", type: "select", options: ["Fixed amount", "Percentage of basic", "Per day", "Per hour", "Tax slabs", "One-time amount"] },
      { name: "value", label: "Amount or percentage", type: "number" },
      { name: "appliesTo", label: "Applies to", type: "select", options: ["All staff", "Teaching staff", "Support staff", "Senior teachers", "Chosen staff"] },
      { name: "taxable", label: "Counts towards taxable income", type: "checkbox" },
    ] }],
    createLabel: "Add component",
  },
  {
    slug: "staff-advances",
    title: "Advances & loans",
    singular: "Advance or loan",
    description: "Money lent to staff, and the instalments recovered from their pay each month.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Reference", kind: "mono" },
      { key: "staff", label: "Staff", kind: "person", sub: "designation" },
      { key: "designation", label: "Designation", detailOnly: true },
      { key: "type", label: "Type" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "instalment", label: "Monthly instalment", kind: "money" },
      { key: "recovered", label: "Recovered", kind: "money" },
      { key: "balance", label: "Balance", kind: "money" },
      { key: "starts", label: "Recovery starts", kind: "date", detailOnly: true },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: advanceRows,
    stats: [
      { label: "Outstanding with staff", value: formatMoney(sum(advanceRows, "balance")) },
      { label: "Recovered so far", value: formatMoney(sum(advanceRows, "recovered")) },
      { label: "Waiting for approval", value: String(countWhere(advanceRows, "status", "Requested")) },
    ],
    form: [{ title: "Advance or loan", fields: [
      { name: "staff", label: "Staff member", type: "select", options: STAFF_NAME_LIST, required: true },
      { name: "type", label: "Type", type: "select", options: ["Salary advance", "Staff loan"], required: true },
      { name: "amount", label: "Amount (Rs)", type: "number", required: true },
      { name: "instalments", label: "Number of instalments", type: "number", placeholder: "3" },
      { name: "starts", label: "First recovery month", type: "select", options: ["December 2026", "January 2027", "February 2027"] },
      { name: "reason", label: "Reason", type: "textarea", wide: true },
    ] }],
    createLabel: "Record advance or loan",
  },
  {
    slug: "payroll-tax",
    title: "Tax & statutory",
    singular: "Tax profile",
    description: "Income tax withheld from each salary this tax year, with provident fund and EOBI contributions.",
    titleKey: "staff",
    columns: [
      { key: "staff", label: "Staff", kind: "person", sub: "designation" },
      { key: "designation", label: "Designation", detailOnly: true },
      { key: "cnic", label: "CNIC", kind: "mono", detailOnly: true },
      { key: "filer", label: "Tax status", kind: "badge" },
      { key: "taxable", label: "Annual taxable income", kind: "money" },
      { key: "monthlyTax", label: "Tax a month", kind: "money" },
      { key: "taxToDate", label: "Tax withheld this year", kind: "money" },
      { key: "providentFund", label: "Provident fund this year", kind: "money" },
      { key: "eobi", label: "EOBI this year", kind: "money", detailOnly: true },
    ],
    rows: taxRows,
    stats: [
      { label: "Tax withheld this year", value: formatMoney(sum(taxRows, "taxToDate")) },
      { label: "Provident fund this year", value: formatMoney(sum(taxRows, "providentFund")) },
      { label: "Non-filers", value: String(countWhere(taxRows, "filer", "Non-filer")) },
    ],
    form: [{ title: "Tax profile", fields: [
      { name: "staff", label: "Staff member", type: "select", options: STAFF_NAME_LIST, required: true },
      { name: "cnic", label: "CNIC", placeholder: "37405-1234567-1" },
      { name: "ntn", label: "NTN (optional)" },
      { name: "filer", label: "Tax status", type: "select", options: ["Filer", "Non-filer"] },
      { name: "exemption", label: "Exemption or rebate (Rs a year)", type: "number" },
      { name: "certificate", label: "Exemption certificate", type: "file" },
    ] }],
    createLabel: "Add tax profile",
  },
  {
    slug: "salary-payments",
    title: "Salary payments",
    singular: "Salary payment",
    description: "Salaries paid out, by bank transfer, cheque or cash.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Payment", kind: "mono" },
      { key: "staff", label: "Staff", kind: "person", sub: "designation" },
      { key: "designation", label: "Designation", detailOnly: true },
      { key: "month", label: "Month" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "mode", label: "Paid by" },
      { key: "bank", label: "From account", detailOnly: true },
      { key: "paidOn", label: "Paid on", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: salaryPaymentRows,
    stats: [
      { label: `Paid for ${PAY_MONTHS[1].label}`, value: formatMoney(sum(salaryPaymentRows.filter((row) => row.month === PAY_MONTHS[1].label), "amount")) },
      { label: "By bank transfer", value: String(countWhere(salaryPaymentRows, "mode", "Bank transfer")) },
      { label: "In cash", value: String(countWhere(salaryPaymentRows, "mode", "Cash")) },
    ],
    form: [{ title: "Pay a salary", fields: [
      { name: "staff", label: "Staff member", type: "select", options: STAFF_NAME_LIST, required: true },
      { name: "month", label: "Month", type: "select", options: PAY_MONTHS.map((month) => month.label), required: true },
      { name: "amount", label: "Amount (Rs)", type: "number" },
      { name: "mode", label: "Paid by", type: "select", options: ["Bank transfer", "Cheque", "Cash"] },
      { name: "bank", label: "From account", type: "select", options: ["Meezan Bank — Payroll", ...BANKS] },
      { name: "paidOn", label: "Paid on", type: "date" },
      { name: "reference", label: "Cheque or transfer reference" },
      { name: "note", label: "Note", type: "textarea", wide: true },
    ] }],
    createLabel: "Pay a salary",
  },
  {
    slug: "payslips",
    title: "Payslips",
    singular: "Payslip",
    description: "The payslip for every paid salary, ready to print or email.",
    titleKey: "number",
    columns: [
      { key: "number", label: "Payslip", kind: "mono" },
      { key: "staff", label: "Staff", kind: "person", sub: "designation" },
      { key: "designation", label: "Designation", detailOnly: true },
      { key: "month", label: "Month" },
      { key: "gross", label: "Gross", kind: "money" },
      { key: "deductions", label: "Deductions", kind: "money" },
      { key: "net", label: "Net pay", kind: "money" },
      { key: "emailed", label: "Emailed", kind: "badge" },
      { key: "status", label: "Status", kind: "badge", detailOnly: true },
    ],
    rows: payslipRows,
    stats: [
      { label: "Payslips", value: String(payslipRows.length) },
      { label: "Not emailed yet", value: String(countWhere(payslipRows, "emailed", "Not sent")) },
    ],
  },
  {
    slug: "payroll-arrears",
    title: "Arrears & adjustments",
    singular: "Arrear or adjustment",
    description: "Pay owed or recovered for past months, settled in a later payroll run without reopening a paid one.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Reference", kind: "mono" },
      { key: "staff", label: "Staff", kind: "person", sub: "designation" },
      { key: "designation", label: "Designation", detailOnly: true },
      { key: "type", label: "Type" },
      { key: "period", label: "For" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "payIn", label: "Settled in", kind: "mono" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: arrearRows,
    stats: [
      { label: "Pending", value: String(countWhere(arrearRows, "status", "Pending")) },
      { label: "To pay in the next run", value: formatMoney(sum(arrearRows.filter((row) => row.status !== "Paid"), "amount")) },
    ],
    form: [{ title: "Arrear or adjustment", fields: [
      { name: "staff", label: "Staff member", type: "select", options: STAFF_NAME_LIST, required: true },
      { name: "type", label: "Type", type: "select", options: ["Increment arrears", "Back-pay", "Correction", "Allowance revision"] },
      { name: "from", label: "From month", type: "select", options: [...PAY_MONTHS].reverse().map((month) => month.label) },
      { name: "to", label: "To month", type: "select", options: [...PAY_MONTHS].reverse().map((month) => month.label) },
      { name: "amount", label: "Amount (Rs, negative to recover)", type: "number" },
      { name: "reason", label: "Reason", type: "textarea", wide: true },
    ] }],
    createLabel: "Add arrear or adjustment",
  },
  {
    slug: "final-settlements",
    title: "Final settlement",
    singular: "Final settlement",
    description: "What is owed to staff who are leaving: last salary, leave encashment and provident fund, less recoveries.",
    titleKey: "staff",
    columns: [
      { key: "staff", label: "Staff", kind: "person", sub: "designation" },
      { key: "designation", label: "Designation", detailOnly: true },
      { key: "lastDay", label: "Last working day", kind: "date" },
      { key: "reason", label: "Reason" },
      { key: "salaryDue", label: "Salary due", kind: "money", detailOnly: true },
      { key: "leaveEncashment", label: "Leave encashment", kind: "money", detailOnly: true },
      { key: "providentFund", label: "Provident fund", kind: "money", detailOnly: true },
      { key: "recoveries", label: "Recoveries", kind: "money" },
      { key: "net", label: "Net payable", kind: "money" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: settlementRows,
    stats: [
      { label: "Settlements open", value: String(settlementRows.filter((row) => row.status !== "Paid").length) },
      { label: "Still to pay", value: formatMoney(sum(settlementRows.filter((row) => row.status !== "Paid"), "net")) },
    ],
    form: [{ title: "Final settlement", fields: [
      { name: "staff", label: "Staff member", type: "select", options: STAFF_NAME_LIST, required: true },
      { name: "lastDay", label: "Last working day", type: "date", required: true },
      { name: "reason", label: "Reason", type: "select", options: ["Resignation", "Retirement", "Contract ended", "Dismissal"] },
      { name: "leaveDays", label: "Leave days to encash", type: "number" },
      { name: "recoveries", label: "Recoveries (Rs)", type: "number", help: "Unpaid advances, loans and school property not returned." },
      { name: "note", label: "Note", type: "textarea", wide: true },
    ] }],
    createLabel: "Start final settlement",
  },
];

// ===========================================================================
// Budgets
// ===========================================================================

const budgetVsActualRows = rows(321, BUDGET_ACCOUNTS.length, (i, r) => {
  const planned = r.money(400000, 3000000, 50000);
  const used = r.int(18, 108);
  const actual = Math.round((planned * used) / 100 / 1000) * 1000;
  const forecast = Math.round((actual / 5) * 12 / 1000) * 1000; // Five months into the year.
  return {
    account: BUDGET_ACCOUNTS[i],
    planned,
    actual,
    variance: planned - actual,
    used,
    forecast,
    status: used > 100 ? "Over budget" : used > 85 ? "Near limit" : "On track",
  };
});

const budgetRequestRows = rows(322, 7, (i, r) => {
  const current = r.money(300000, 2500000, 50000);
  const change = r.money(25000, 400000, 5000);
  return {
    reference: `BR-2026-${String(11 + i).padStart(3, "0")}`,
    account: BUDGET_ACCOUNTS[(i * 3 + 1) % BUDGET_ACCOUNTS.length],
    kind: ["Increase", "Transfer", "New line", "Increase", "Decrease", "Increase", "Transfer"][i],
    current,
    requested: current + (i === 4 ? -change : change),
    reason: ["Electricity tariff rise", "Move unused events money", "New robotics club", "Lab expansion", "Fewer trips this year", "Library digitisation", "Cover maintenance overrun"][i],
    requestedBy: ACCOUNTANT,
    status: ["Pending", "Approved", "Pending", "Rejected", "Approved", "Pending", "Approved"][i],
  };
});

const revisionRows = rows(323, 10, (i, r) => {
  const before = r.money(300000, 2500000, 50000);
  const delta = r.money(20000, 300000, 5000) * (i % 3 === 1 ? -1 : 1);
  return {
    reference: `REV-${String(301 + i)}`,
    account: BUDGET_ACCOUNTS[(i * 5) % BUDGET_ACCOUNTS.length],
    change: delta > 0 ? (i % 4 === 0 ? "Transfer in" : "Increase") : i % 4 === 1 ? "Transfer out" : "Decrease",
    before,
    after: before + delta,
    difference: delta,
    approvedBy: i % 2 === 0 ? ADMINISTRATOR : PRINCIPAL,
    date: shiftDate(DEMO_TODAY, -130 + i * 12),
  };
});

const MONTH_NAMES = ["July", "August", "September", "October", "November", "December", "January", "February", "March", "April", "May", "June"];

const financialPeriodRows = withIds([
  { name: "FY 2026/2027", kind: "Year", starts: "2026-07-01", ends: "2027-06-30", closedBy: null, status: "Open" },
  ...MONTH_NAMES.map((month, i) => {
    const year = i < 6 ? 2026 : 2027;
    const monthNumber = ((i + 6) % 12) + 1;
    const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
    const end = shiftDate(monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`, -1);
    return {
      name: `${month} ${year}`,
      kind: "Month",
      starts: start,
      ends: end,
      closedBy: i < 4 ? ADMINISTRATOR : null,
      status: i < 4 ? "Closed" : i === 4 ? "Open" : "Upcoming",
    };
  }),
  { name: "FY 2025/2026", kind: "Year", starts: "2025-07-01", ends: "2026-06-30", closedBy: ADMINISTRATOR, status: "Closed" },
]);

const chartOfAccountRows = withIds([
  { code: "1010", name: "Cash in hand", type: "Asset", group: "Current assets" },
  { code: "1020", name: "Petty cash", type: "Asset", group: "Current assets" },
  { code: "1030", name: "Bank accounts", type: "Asset", group: "Current assets" },
  { code: "1100", name: "Fees receivable", type: "Asset", group: "Current assets" },
  { code: "1200", name: "Staff advances", type: "Asset", group: "Current assets" },
  { code: "1500", name: "Furniture and equipment", type: "Asset", group: "Fixed assets" },
  { code: "2010", name: "Vendors payable", type: "Liability", group: "Current liabilities" },
  { code: "2100", name: "Security deposits held", type: "Liability", group: "Current liabilities" },
  { code: "2200", name: "Tax withheld payable", type: "Liability", group: "Current liabilities" },
  { code: "2300", name: "Provident fund payable", type: "Liability", group: "Long-term liabilities" },
  { code: "3000", name: "Accumulated fund", type: "Equity", group: "Equity" },
  { code: "4010", name: "Tuition fees", type: "Income", group: "Fee income" },
  { code: "4020", name: "Admission fees", type: "Income", group: "Fee income" },
  { code: "4030", name: "Transport fees", type: "Income", group: "Fee income" },
  { code: "4100", name: "Donations and grants", type: "Income", group: "Other income" },
  { code: "5010", name: "Salaries", type: "Expense", group: "Staff costs" },
  { code: "5100", name: "Utilities", type: "Expense", group: "Operating costs" },
  { code: "5200", name: "Building maintenance", type: "Expense", group: "Operating costs" },
  { code: "5300", name: "Library books", type: "Expense", group: "Academic costs" },
  { code: "5310", name: "Science labs", type: "Expense", group: "Academic costs" },
  { code: "5320", name: "IT & computers", type: "Expense", group: "Academic costs" },
  { code: "5330", name: "Sports equipment", type: "Expense", group: "Academic costs" },
  { code: "5400", name: "Events", type: "Expense", group: "Activities" },
].map((account, i) => {
  const random = createRandom(330 + i);
  return { ...account, balance: random.money(40000, 9000000, 1000), status: "Active" };
}));

const budgetsModule: Resource[] = [
  {
    slug: "budget-vs-actual",
    title: "Budget vs actual",
    singular: "Budget line",
    description: "What each account planned to spend this year against what it has spent, with a year-end forecast.",
    titleKey: "account",
    columns: [
      { key: "account", label: "Account" },
      { key: "planned", label: "Planned", kind: "money" },
      { key: "actual", label: "Spent", kind: "money" },
      { key: "variance", label: "Left to spend", kind: "money" },
      { key: "used", label: "Used", kind: "percent" },
      { key: "forecast", label: "Year-end forecast", kind: "money" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: budgetVsActualRows,
    stats: [
      { label: "Planned this year", value: formatMoney(sum(budgetVsActualRows, "planned")) },
      { label: "Spent so far", value: formatMoney(sum(budgetVsActualRows, "actual")) },
      { label: "Accounts over budget", value: String(countWhere(budgetVsActualRows, "status", "Over budget")) },
    ],
    related: [{ slug: "expenses", matchKey: "account", title: "Spending on this account" }],
  },
  {
    slug: "budget-requests",
    title: "Budget requests",
    singular: "Budget request",
    description: "Changes to the budget the accountant asks for; the school administrator approves them.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Request", kind: "mono" },
      { key: "account", label: "Account" },
      { key: "kind", label: "Change" },
      { key: "current", label: "Current", kind: "money" },
      { key: "requested", label: "Requested", kind: "money" },
      { key: "reason", label: "Reason" },
      { key: "requestedBy", label: "Requested by", detailOnly: true },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: budgetRequestRows,
    stats: [
      { label: "Waiting for approval", value: String(countWhere(budgetRequestRows, "status", "Pending")) },
      { label: "Approved", value: String(countWhere(budgetRequestRows, "status", "Approved")) },
    ],
    form: [{ title: "Request a budget change", fields: [
      { name: "account", label: "Account", type: "select", options: BUDGET_ACCOUNTS, required: true },
      { name: "kind", label: "Change", type: "select", options: ["Increase", "Decrease", "Transfer", "New line"], required: true },
      { name: "amount", label: "Amount (Rs)", type: "number", required: true },
      { name: "from", label: "Transfer from (for transfers)", type: "select", options: BUDGET_ACCOUNTS },
      { name: "reason", label: "Reason", type: "textarea", wide: true, required: true },
      { name: "attachment", label: "Supporting document", type: "file" },
    ] }],
    createLabel: "Request a change",
    submitLabel: "Send for approval",
  },
  {
    slug: "budget-revisions",
    title: "Budget revisions",
    singular: "Budget revision",
    description: "Every approved change to the budget. Revisions are kept; nothing is overwritten.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Revision", kind: "mono" },
      { key: "account", label: "Account" },
      { key: "change", label: "Change" },
      { key: "before", label: "Before", kind: "money" },
      { key: "after", label: "After", kind: "money" },
      { key: "difference", label: "Difference", kind: "money" },
      { key: "approvedBy", label: "Approved by" },
      { key: "date", label: "Date", kind: "date" },
    ],
    rows: revisionRows,
    stats: [{ label: "Revisions this year", value: String(revisionRows.length) }],
  },
  {
    slug: "financial-periods",
    title: "Financial periods",
    singular: "Financial period",
    description: "The financial year and its months. Once a period is closed, nothing dated in it can change.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Period" },
      { key: "kind", label: "Type" },
      { key: "starts", label: "Starts", kind: "date" },
      { key: "ends", label: "Ends", kind: "date" },
      { key: "closedBy", label: "Closed by" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: financialPeriodRows,
    stats: [
      { label: "Current period", value: String(financialPeriodRows.find((row) => row.kind === "Month" && row.status === "Open")?.name ?? "—") },
      { label: "Months closed", value: String(financialPeriodRows.filter((row) => row.kind === "Month" && row.status === "Closed").length) },
    ],
    form: [{ title: "Financial year", fields: [
      { name: "name", label: "Name", required: true, placeholder: "FY 2027/2028" },
      { name: "starts", label: "Starts", type: "date", required: true },
      { name: "ends", label: "Ends", type: "date", required: true },
      { name: "monthly", label: "Split into monthly periods", type: "checkbox" },
    ] }],
    createLabel: "Open a financial year",
  },
  {
    slug: "chart-of-accounts",
    title: "Chart of accounts",
    singular: "Account",
    description: "Every account money is recorded against: assets, liabilities, equity, income and expenses.",
    titleKey: "name",
    columns: [
      { key: "code", label: "Code", kind: "mono" },
      { key: "name", label: "Account" },
      { key: "type", label: "Type" },
      { key: "group", label: "Group" },
      { key: "balance", label: "Balance", kind: "money" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: chartOfAccountRows,
    stats: [
      { label: "Accounts", value: String(chartOfAccountRows.length) },
      { label: "Income accounts", value: String(countWhere(chartOfAccountRows, "type", "Income")) },
      { label: "Expense accounts", value: String(countWhere(chartOfAccountRows, "type", "Expense")) },
    ],
    form: [{ title: "Account", fields: [
      { name: "code", label: "Code", required: true, placeholder: "5410" },
      { name: "name", label: "Name", required: true },
      { name: "type", label: "Type", type: "select", options: ["Asset", "Liability", "Equity", "Income", "Expense"], required: true },
      { name: "group", label: "Group" },
      { name: "opening", label: "Opening balance (Rs)", type: "number" },
    ] }],
    createLabel: "Add account",
    related: [{ slug: "budgets", matchKey: "account", title: "Budget for this account" }],
  },
];

// ===========================================================================
// Students (fee views)
// ===========================================================================

const admissionNumber = (i: number) => `SPS/${2020 + (i % 7)}/${String(1001 + i)}`;
const guardianOf = (i: number) => PARENT_NAMES[i % PARENT_NAMES.length];

const feeStatementRows = rows(341, STUDENT_NAMES.length, (i, r) => {
  const billed = r.money(90000, 210000, 1000);
  const concession = i % 6 === 2 ? Math.round(billed * 0.1 / 1000) * 1000 : 0;
  const owed = billed - concession;
  const state = i % 5 === 3 ? "Overdue" : i % 4 === 1 ? "Dues pending" : "Clear";
  const paid = state === "Clear" ? owed : state === "Overdue" ? owed - r.money(18000, 60000, 1000) : owed - r.money(5000, 20000, 1000);
  return {
    student: STUDENT_NAMES[i],
    section: SECTIONS[i % SECTIONS.length],
    admissionNumber: admissionNumber(i),
    family: guardianOf(i),
    billed,
    concession,
    paid,
    balance: owed - paid,
    lastPayment: r.date(-50, -1),
    status: state,
  };
});

const familyRows = withIds(
  PARENT_NAMES.map((parent, p) => {
    const children = feeStatementRows.filter((row) => row.family === parent);
    const billed = sum(children, "billed");
    const paid = sum(children, "paid");
    const balance = sum(children, "balance");
    return {
      family: parent,
      children: children.length,
      names: children.map((child) => String(child.student).split(" ")[0]).join(", "),
      billed,
      paid,
      balance,
      siblingDiscount: children.length > 1 ? "10% on second child" : "—",
      contact: createRandom(350 + p).phone(),
      status: balance === 0 ? "Clear" : children.some((child) => child.status === "Overdue") ? "Overdue" : "Dues pending",
    };
  }).filter((family) => family.children > 0),
);

const concessionRows = rows(342, 14, (i, r) => {
  const student = (i * 7 + 2) % STUDENT_NAMES.length;
  const type = ["Merit scholarship", "Need-based", "Sibling discount", "Staff child", "Sports scholarship", "Sibling discount", "Need-based"][i % 7];
  const percent = type === "Merit scholarship" ? 50 : type === "Staff child" ? 100 : type === "Sports scholarship" ? 25 : type === "Sibling discount" ? 10 : 30;
  return {
    student: STUDENT_NAMES[student],
    section: SECTIONS[student % SECTIONS.length],
    type,
    basis: `${percent}% of tuition`,
    monthly: r10((r.pick([14000, 17000, 21000]) * percent) / 100),
    validUntil: r.pick(["2027-03-31", "2027-06-30", "2026-12-31"]),
    approvedBy: i % 5 === 4 ? null : PRINCIPAL,
    status: i % 5 === 4 ? "Pending" : i === 11 ? "Expired" : "Active",
  };
});

const defaulterRows = withIds(
  feeStatementRows
    .filter((row) => row.status !== "Clear")
    .map((row, i) => {
      const random = createRandom(343 + i);
      const daysLate = row.status === "Overdue" ? random.int(32, 95) : random.int(3, 28);
      const status = daysLate > 60 ? (i % 2 === 0 ? "Fee hold" : "Escalated") : i % 3 === 0 ? "Promised to pay" : "Reminder sent";
      return {
        student: row.student,
        section: row.section,
        guardian: row.family,
        phone: random.phone(),
        overdue: row.balance,
        daysLate,
        bucket: daysLate > 60 ? "60+ days" : daysLate > 30 ? "31–60 days" : "1–30 days",
        lastReminder: shiftDate(DEMO_TODAY, -random.int(1, 12)),
        promise: status === "Promised to pay" ? shiftDate(DEMO_TODAY, random.int(2, 14)) : null,
        status,
      };
    })
    .sort((a, b) => b.daysLate - a.daysLate),
);

const clearanceRows = rows(344, 8, (i, r) => {
  const student = (i * 11 + 5) % STUDENT_NAMES.length;
  const dues = i % 3 === 1 ? r.money(6000, 45000, 1000) : 0;
  return {
    reference: `CLR-2026-${String(31 + i).padStart(3, "0")}`,
    student: STUDENT_NAMES[student],
    section: SECTIONS[student % SECTIONS.length],
    reason: ["Withdrawal", "Transfer", "Board exam", "Graduation"][i % 4],
    requested: r.date(-30, 0),
    dues,
    status: dues > 0 ? "Dues pending" : i % 4 === 3 ? "Pending" : "Cleared",
  };
});

const studentsModule: Resource[] = [
  {
    slug: "fee-statements",
    title: "Fee statements",
    singular: "Fee statement",
    description: "Each learner's fee account for the year: billed, discounted, paid and still owed.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Learner", kind: "person", sub: "section" },
      { key: "section", label: "Section", detailOnly: true },
      { key: "admissionNumber", label: "Admission no.", kind: "mono" },
      { key: "family", label: "Family" },
      { key: "billed", label: "Billed", kind: "money" },
      { key: "concession", label: "Concession", kind: "money", detailOnly: true },
      { key: "paid", label: "Paid", kind: "money" },
      { key: "balance", label: "Balance", kind: "money" },
      { key: "lastPayment", label: "Last payment", kind: "date", detailOnly: true },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: feeStatementRows,
    stats: [
      { label: "Billed this year", value: formatMoney(sum(feeStatementRows, "billed")) },
      { label: "Collected", value: formatMoney(sum(feeStatementRows, "paid")) },
      { label: "Still owed", value: formatMoney(sum(feeStatementRows, "balance")) },
      { label: "Learners fully paid", value: String(countWhere(feeStatementRows, "status", "Clear")) },
    ],
    related: [{ slug: "fee-invoices", matchKey: "student", title: "Invoices" }],
  },
  {
    slug: "family-accounts",
    title: "Family accounts",
    singular: "Family account",
    description: "Brothers and sisters under one guardian, with their fees combined.",
    titleKey: "family",
    columns: [
      { key: "family", label: "Guardian", kind: "person", sub: "contact" },
      { key: "contact", label: "Phone", detailOnly: true },
      { key: "children", label: "Children", kind: "number" },
      { key: "names", label: "Learners" },
      { key: "billed", label: "Billed", kind: "money" },
      { key: "paid", label: "Paid", kind: "money" },
      { key: "balance", label: "Balance", kind: "money" },
      { key: "siblingDiscount", label: "Sibling discount", detailOnly: true },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: familyRows,
    stats: [
      { label: "Families", value: String(familyRows.length) },
      { label: "With more than one child", value: String(familyRows.filter((row) => row.children > 1).length) },
      { label: "Families owing", value: String(familyRows.filter((row) => row.status !== "Clear").length) },
    ],
    related: [{ slug: "fee-statements", matchKey: "family", title: "Children's fee statements" }],
  },
  {
    slug: "fee-concessions",
    title: "Concessions",
    singular: "Concession",
    description: "Scholarships and discounts, why each was given, and until when.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Learner", kind: "person", sub: "section" },
      { key: "section", label: "Section", detailOnly: true },
      { key: "type", label: "Type" },
      { key: "basis", label: "Discount" },
      { key: "monthly", label: "Worth a month", kind: "money" },
      { key: "validUntil", label: "Valid until", kind: "date" },
      { key: "approvedBy", label: "Approved by" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: concessionRows,
    stats: [
      { label: "Active concessions", value: String(countWhere(concessionRows, "status", "Active")) },
      { label: "Given up a month", value: formatMoney(sum(concessionRows.filter((row) => row.status === "Active"), "monthly")) },
      { label: "Waiting for approval", value: String(countWhere(concessionRows, "status", "Pending")) },
    ],
    form: [{ title: "Concession", fields: [
      { name: "student", label: "Learner", type: "select", options: STUDENT_NAMES, required: true },
      { name: "type", label: "Type", type: "select", options: ["Merit scholarship", "Need-based", "Sibling discount", "Staff child", "Sports scholarship"], required: true },
      { name: "method", label: "Discount as", type: "select", options: ["Percentage of tuition", "Fixed amount a month"] },
      { name: "value", label: "Percentage or amount", type: "number" },
      { name: "validUntil", label: "Valid until", type: "date" },
      { name: "evidence", label: "Supporting document", type: "file" },
      { name: "reason", label: "Reason", type: "textarea", wide: true },
    ] }],
    createLabel: "Add concession",
    submitLabel: "Send for approval",
  },
  {
    slug: "fee-defaulters",
    title: "Defaulters",
    singular: "Defaulter",
    description: "Families with unpaid fees, how late they are, and what has been done to follow up.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Learner", kind: "person", sub: "section" },
      { key: "section", label: "Section", detailOnly: true },
      { key: "guardian", label: "Guardian" },
      { key: "phone", label: "Phone", detailOnly: true },
      { key: "overdue", label: "Owed", kind: "money" },
      { key: "daysLate", label: "Days late", kind: "number" },
      { key: "bucket", label: "Lateness" },
      { key: "lastReminder", label: "Last reminder", kind: "date" },
      { key: "promise", label: "Promised by", kind: "date" },
      { key: "status", label: "Follow-up", kind: "badge" },
    ],
    rows: defaulterRows,
    stats: [
      { label: "Learners owing", value: String(defaulterRows.length) },
      { label: "Total owed", value: formatMoney(sum(defaulterRows, "overdue")) },
      { label: "Over 60 days late", value: String(countWhere(defaulterRows, "bucket", "60+ days")) },
    ],
    form: [{ title: "Log a follow-up", fields: [
      { name: "student", label: "Learner", type: "select", options: STUDENT_NAMES, required: true },
      { name: "action", label: "What was done", type: "select", options: ["Reminder sent", "Phone call", "Meeting with guardian", "Promised to pay", "Fee hold", "Escalated to principal"] },
      { name: "promise", label: "Promised to pay by", type: "date" },
      { name: "channel", label: "Send reminder by", type: "select", options: ["SMS", "Email", "WhatsApp", "Letter"] },
      { name: "note", label: "Note", type: "textarea", wide: true },
    ] }],
    createLabel: "Log follow-up",
  },
  {
    slug: "fee-clearances",
    title: "Clearance",
    singular: "Clearance",
    description: "No-dues certificates for learners leaving, transferring or sitting board exams.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Clearance", kind: "mono" },
      { key: "student", label: "Learner", kind: "person", sub: "section" },
      { key: "section", label: "Section", detailOnly: true },
      { key: "reason", label: "Reason" },
      { key: "requested", label: "Requested", kind: "date" },
      { key: "dues", label: "Dues", kind: "money" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: clearanceRows,
    stats: [
      { label: "Cleared", value: String(countWhere(clearanceRows, "status", "Cleared")) },
      { label: "Blocked by dues", value: String(countWhere(clearanceRows, "status", "Dues pending")) },
    ],
    form: [{ title: "Issue a clearance", fields: [
      { name: "student", label: "Learner", type: "select", options: STUDENT_NAMES, required: true },
      { name: "reason", label: "Reason", type: "select", options: ["Withdrawal", "Transfer", "Board exam", "Graduation"], required: true },
      { name: "library", label: "Library books returned", type: "checkbox" },
      { name: "deposit", label: "Refund security deposit", type: "checkbox" },
      { name: "note", label: "Note", type: "textarea", wide: true },
    ] }],
    createLabel: "Issue clearance",
  },
];

// ===========================================================================
// Reports
// ===========================================================================

const collectionRows = rows(361, 60, (i, r) => {
  const student = (i * 13 + 3) % STUDENT_NAMES.length;
  return {
    receipt: `RCP-2026-${String(8800 + i)}`,
    date: shiftDate(DEMO_TODAY, -Math.floor(i / 3)),
    student: STUDENT_NAMES[student],
    section: SECTIONS[student % SECTIONS.length],
    invoice: `INV-2026-${String(1200 + ((i * 7) % 40))}`,
    mode: r.pick(PAYMENT_MODES),
    cashier: i % 4 === 3 ? "Saima Tariq" : ACCOUNTANT,
    amount: r.money(6000, 42000, 500),
  };
});

const duesRows = withIds(
  feeStatementRows
    .filter((row) => Number(row.balance) > 0)
    .map((row, i) => {
      const balance = Number(row.balance);
      const random = createRandom(362 + i);
      const late = row.status === "Overdue";
      const over60 = late && i % 3 === 0 ? Math.round(balance * 0.4 / 500) * 500 : 0;
      const d31 = late ? Math.round((balance - over60) * 0.5 / 500) * 500 : 0;
      const d1 = late ? balance - over60 - d31 : Math.round(balance * random.int(0, 60) / 100 / 500) * 500;
      return {
        student: row.student,
        section: row.section,
        notDue: balance - over60 - d31 - d1,
        d1,
        d31,
        over60,
        total: balance,
      };
    }),
);

const incomeExpenseRows = withIds([
  { month: "June 2026", fees: 3600000, other: 120000, expenses: 1350000, payroll: 1770000 },
  { month: "July 2026", fees: 3900000, other: 60000, expenses: 1640000, payroll: 1840000 },
  { month: "August 2026", fees: 4050000, other: 85000, expenses: 1700000, payroll: 1860000 },
  { month: "September 2026", fees: 3820000, other: 240000, expenses: 2150000, payroll: 1870000 },
  { month: "October 2026", fees: 4100000, other: 95000, expenses: 1730000, payroll: 1880000 },
  { month: "November 2026", fees: 2650000, other: 50000, expenses: 1120000, payroll: 0 },
].map((month) => ({
  ...month,
  income: month.fees + month.other,
  spending: month.expenses + month.payroll,
  net: month.fees + month.other - month.expenses - month.payroll,
})));

const payrollReportRows = withIds(
  PAY_MONTHS.slice(0, 3).flatMap((month, monthIndex) =>
    [...new Set(STAFF.map((member) => member.department))].map((department) => {
      const members = STAFF.filter((member) => member.department === department);
      const pays = members.map((member) => payFor(member, monthIndex));
      return {
        label: `${department} — ${month.short}`,
        department,
        month: month.label,
        staff: members.length,
        basic: members.reduce((total, member) => total + member.basic, 0),
        allowances: pays.reduce((total, pay) => total + pay.allowances, 0),
        deductions: pays.reduce((total, pay) => total + pay.deductions, 0),
        net: pays.reduce((total, pay) => total + pay.net, 0),
      };
    }),
  ),
);

const budgetReportRows = rows(363, DEPARTMENTS.length, (i, r) => {
  const planned = r.money(500000, 4000000, 50000);
  const used = r.int(20, 104);
  const spent = Math.round((planned * used) / 100 / 1000) * 1000;
  const committed = Math.min(Math.max(planned - spent, 0), r.money(0, 200000, 5000));
  return {
    department: DEPARTMENTS[i],
    planned,
    spent,
    committed,
    available: planned - spent - committed,
    used,
    status: used > 100 ? "Over budget" : used > 85 ? "Near limit" : "On track",
  };
});

const LEDGER_TEMPLATES: Array<[account: string, description: string, book: string, debit: boolean]> = [
  ["Bank accounts", "Fee collection banked", "Bank book", true],
  ["Tuition fees", "Tuition invoiced, Class 6–8", "Journal", false],
  ["Cash in hand", "Counter collection", "Cash book", true],
  ["Utilities", "Electricity bill, IESCO", "Bank book", true],
  ["Salaries", "Payroll run, teaching staff", "Journal", true],
  ["Tax withheld payable", "Income tax withheld from salaries", "Journal", false],
  ["Petty cash", "Petty cash top-up", "Cash book", true],
  ["Vendors payable", "Lab chemicals, Al-Noor Traders", "Journal", false],
  ["Fees receivable", "Invoices issued for November", "Day book", true],
  ["Transport fees", "Bus fees invoiced", "Journal", false],
];

const ledgerRows = rows(364, 40, (i, r) => {
  const [account, description, book, debit] = LEDGER_TEMPLATES[i % LEDGER_TEMPLATES.length];
  const amount = r.money(8000, 950000, 500);
  return {
    entry: `JV-2026-${String(4100 + i)}`,
    date: shiftDate(DEMO_TODAY, -Math.floor(i * 1.4)),
    account,
    description,
    book,
    debit: debit ? amount : null,
    credit: debit ? null : amount,
    postedBy: i % 5 === 0 ? ADMINISTRATOR : ACCOUNTANT,
  };
});

const statementRows = withIds([
  { line: "Tuition fees", statement: "Income statement", section: "Income", current: 20450000, previous: 18920000 },
  { line: "Admission fees", statement: "Income statement", section: "Income", current: 1850000, previous: 2100000 },
  { line: "Transport fees", statement: "Income statement", section: "Income", current: 2210000, previous: 1980000 },
  { line: "Donations and grants", statement: "Income statement", section: "Income", current: 650000, previous: 400000 },
  { line: "Salaries", statement: "Income statement", section: "Expenses", current: 9220000, previous: 8640000 },
  { line: "Utilities", statement: "Income statement", section: "Expenses", current: 2140000, previous: 1810000 },
  { line: "Building maintenance", statement: "Income statement", section: "Expenses", current: 1380000, previous: 1520000 },
  { line: "Academic costs", statement: "Income statement", section: "Expenses", current: 1960000, previous: 1700000 },
  { line: "Events and activities", statement: "Income statement", section: "Expenses", current: 640000, previous: 580000 },
  { line: "Cash and bank", statement: "Balance sheet", section: "Assets", current: 14800000, previous: 11250000 },
  { line: "Fees receivable", statement: "Balance sheet", section: "Assets", current: 2255000, previous: 1980000 },
  { line: "Staff advances", statement: "Balance sheet", section: "Assets", current: 640000, previous: 410000 },
  { line: "Furniture and equipment", statement: "Balance sheet", section: "Assets", current: 18300000, previous: 18900000 },
  { line: "Vendors payable", statement: "Balance sheet", section: "Liabilities", current: 485000, previous: 620000 },
  { line: "Security deposits held", statement: "Balance sheet", section: "Liabilities", current: 3900000, previous: 3650000 },
  { line: "Provident fund payable", statement: "Balance sheet", section: "Liabilities", current: 6200000, previous: 5480000 },
  { line: "Accumulated fund", statement: "Balance sheet", section: "Equity", current: 25410000, previous: 22790000 },
].map((line) => {
  const change = ((line.current - line.previous) / line.previous) * 100;
  return { ...line, change: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%` };
}));

const AUDIT_ACTIONS: Array<[action: string, record: string, withAmount: boolean]> = [
  ["Invoice voided", "INV-2026-1214", true],
  ["Payment refunded", "RCP-2026-8812", true],
  ["Expense edited", "Lab chemicals", true],
  ["Payroll run approved", "PAY-2026-10-T", true],
  ["Concession approved", "Merit scholarship", false],
  ["Budget revised", "Utilities", true],
  ["Financial period closed", "October 2026", false],
  ["Fee structure changed", "Tuition — Middle", true],
  ["Bank account reconciled", "HBL — Saddar", false],
  ["Salary structure changed", "EMP-104", true],
];

const auditRows = rows(365, 26, (i, r) => {
  const [action, record, withAmount] = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length];
  const byAdmin = /approved|closed|revised/.test(action.toLowerCase());
  return {
    reference: `AUD-${String(90210 + i)}`,
    when: shiftDate(DEMO_TODAY, -Math.floor(i * 1.6)),
    user: byAdmin ? ADMINISTRATOR : ACCOUNTANT,
    role: byAdmin ? "School administrator" : "Accountant",
    action,
    record,
    amount: withAmount ? r.money(2000, 900000, 500) : null,
    ip: `10.0.${r.int(0, 3)}.${r.int(10, 240)}`,
  };
});

const FINANCE_REPORT_NAMES = [
  "Daily collection", "Collection by cashier", "Dues by lateness", "Defaulters list", "Income vs expense",
  "Monthly salary sheet", "Bank advice", "Budget vs actual", "Trial balance", "Cash book", "Income statement", "Balance sheet",
];

const scheduleRows = rows(366, 8, (i, r) => ({
  name: ["Daily collection to principal", "Weekly defaulters list", "Monthly income vs expense", "Monthly salary sheet", "Bank advice for payroll", "Quarterly budget review", "Monthly trial balance", "Term balance sheet"][i],
  report: ["Daily collection", "Defaulters list", "Income vs expense", "Monthly salary sheet", "Bank advice", "Budget vs actual", "Trial balance", "Balance sheet"][i],
  frequency: ["Daily", "Weekly", "Monthly", "Monthly", "Monthly", "Quarterly", "Monthly", "Per term"][i],
  format: ["PDF", "Excel", "PDF", "Excel", "CSV", "Excel", "Excel", "PDF"][i],
  recipients: ["Principal", "Accounts office", "Principal, administrator", "Accounts office", "Meezan Bank", "Administrator", "Auditor", "Board of governors"][i],
  lastRun: r.date(-30, -1),
  nextRun: r.date(1, 30),
  status: i === 5 ? "Paused" : "Active",
}));

const reportsModule: Resource[] = [
  {
    slug: "report-collections",
    title: "Collections report",
    singular: "Receipt",
    description: "Every fee payment received: when, from whom, how, and who took it.",
    titleKey: "receipt",
    columns: [
      { key: "receipt", label: "Receipt", kind: "mono" },
      { key: "date", label: "Date", kind: "date" },
      { key: "student", label: "Learner", kind: "person", sub: "section" },
      { key: "section", label: "Section", detailOnly: true },
      { key: "invoice", label: "Invoice", kind: "mono" },
      { key: "mode", label: "Paid by" },
      { key: "cashier", label: "Received by" },
      { key: "amount", label: "Amount", kind: "money" },
    ],
    rows: collectionRows,
    stats: [
      { label: "Collected (last 20 days)", value: formatMoney(sum(collectionRows, "amount")) },
      { label: "Today", value: formatMoney(sum(collectionRows.filter((row) => row.date === DEMO_TODAY), "amount")) },
      ...PAYMENT_MODES.slice(0, 3).map((mode) => ({ label: mode, value: formatMoney(sum(collectionRows.filter((row) => row.mode === mode), "amount")) })),
    ],
  },
  {
    slug: "report-dues",
    title: "Dues report",
    singular: "Learner dues",
    description: "What each learner still owes, split by how late it is.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Learner", kind: "person", sub: "section" },
      { key: "section", label: "Section", detailOnly: true },
      { key: "notDue", label: "Not yet due", kind: "money" },
      { key: "d1", label: "1–30 days", kind: "money" },
      { key: "d31", label: "31–60 days", kind: "money" },
      { key: "over60", label: "Over 60 days", kind: "money" },
      { key: "total", label: "Total owed", kind: "money" },
    ],
    rows: duesRows,
    stats: [
      { label: "Not yet due", value: formatMoney(sum(duesRows, "notDue")) },
      { label: "1–30 days", value: formatMoney(sum(duesRows, "d1")) },
      { label: "31–60 days", value: formatMoney(sum(duesRows, "d31")) },
      { label: "Over 60 days", value: formatMoney(sum(duesRows, "over60")) },
      { label: "Total owed", value: formatMoney(sum(duesRows, "total")) },
    ],
  },
  {
    slug: "report-income-expense",
    title: "Income & expense report",
    singular: "Month",
    description: "Money in against money out, month by month.",
    titleKey: "month",
    columns: [
      { key: "month", label: "Month" },
      { key: "fees", label: "Fee income", kind: "money" },
      { key: "other", label: "Other income", kind: "money" },
      { key: "income", label: "Total income", kind: "money" },
      { key: "expenses", label: "Expenses", kind: "money" },
      { key: "payroll", label: "Payroll", kind: "money" },
      { key: "spending", label: "Total spending", kind: "money", detailOnly: true },
      { key: "net", label: "Surplus", kind: "money" },
    ],
    rows: incomeExpenseRows,
    stats: [
      { label: "Income, six months", value: formatMoney(sum(incomeExpenseRows, "income")) },
      { label: "Spending, six months", value: formatMoney(sum(incomeExpenseRows, "spending")) },
      { label: "Surplus", value: formatMoney(sum(incomeExpenseRows, "net")) },
    ],
  },
  {
    slug: "report-payroll",
    title: "Payroll report",
    singular: "Department month",
    description: "Salary cost by department for each month.",
    titleKey: "label",
    columns: [
      { key: "label", label: "Department and month" },
      { key: "department", label: "Department", detailOnly: true },
      { key: "month", label: "Month", detailOnly: true },
      { key: "staff", label: "Staff", kind: "number" },
      { key: "basic", label: "Basic", kind: "money" },
      { key: "allowances", label: "Allowances", kind: "money" },
      { key: "deductions", label: "Deductions", kind: "money" },
      { key: "net", label: "Net pay", kind: "money" },
    ],
    rows: payrollReportRows,
    stats: PAY_MONTHS.slice(0, 3).map((month) => ({
      label: `Net, ${month.label}`,
      value: formatMoney(sum(payrollReportRows.filter((row) => row.month === month.label), "net")),
    })),
  },
  {
    slug: "report-budget",
    title: "Budget report",
    singular: "Department budget",
    description: "Each department's budget: spent, committed to approved purchases, and still available.",
    titleKey: "department",
    columns: [
      { key: "department", label: "Department" },
      { key: "planned", label: "Planned", kind: "money" },
      { key: "spent", label: "Spent", kind: "money" },
      { key: "committed", label: "Committed", kind: "money" },
      { key: "available", label: "Available", kind: "money" },
      { key: "used", label: "Used", kind: "percent" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: budgetReportRows,
    stats: [
      { label: "Planned", value: formatMoney(sum(budgetReportRows, "planned")) },
      { label: "Spent", value: formatMoney(sum(budgetReportRows, "spent")) },
      { label: "Committed", value: formatMoney(sum(budgetReportRows, "committed")) },
    ],
  },
  {
    slug: "report-ledger",
    title: "Ledger & books",
    singular: "Ledger entry",
    description: "Every posting in the day book, cash book, bank book and journal.",
    titleKey: "entry",
    columns: [
      { key: "entry", label: "Entry", kind: "mono" },
      { key: "date", label: "Date", kind: "date" },
      { key: "book", label: "Book" },
      { key: "account", label: "Account" },
      { key: "description", label: "Description" },
      { key: "debit", label: "Debit", kind: "money" },
      { key: "credit", label: "Credit", kind: "money" },
      { key: "postedBy", label: "Posted by", detailOnly: true },
    ],
    rows: ledgerRows,
    stats: [
      { label: "Entries", value: String(ledgerRows.length) },
      { label: "Total debits", value: formatMoney(sum(ledgerRows, "debit")) },
      { label: "Total credits", value: formatMoney(sum(ledgerRows, "credit")) },
    ],
  },
  {
    slug: "report-financial-statements",
    title: "Financial statements",
    singular: "Statement line",
    description: "The income statement and balance sheet for this financial year against last year.",
    titleKey: "line",
    columns: [
      { key: "line", label: "Line" },
      { key: "statement", label: "Statement" },
      { key: "section", label: "Section" },
      { key: "current", label: "FY 2026/2027 to date", kind: "money" },
      { key: "previous", label: "Same period last year", kind: "money" },
      { key: "change", label: "Change" },
    ],
    rows: statementRows,
    stats: (() => {
      const income = sum(statementRows.filter((row) => row.section === "Income"), "current");
      const expenses = sum(statementRows.filter((row) => row.section === "Expenses"), "current");
      return [
        { label: "Income", value: formatMoney(income) },
        { label: "Expenses", value: formatMoney(expenses) },
        { label: "Surplus", value: formatMoney(income - expenses) },
        { label: "Total assets", value: formatMoney(sum(statementRows.filter((row) => row.section === "Assets"), "current")) },
      ];
    })(),
  },
  {
    slug: "report-audit",
    title: "Finance audit trail",
    singular: "Audit event",
    description: "Who changed money records, and when: voids, refunds, edits, approvals and closings.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Event", kind: "mono" },
      { key: "when", label: "Date", kind: "date" },
      { key: "user", label: "By", kind: "person", sub: "role" },
      { key: "role", label: "Role", detailOnly: true },
      { key: "action", label: "Action" },
      { key: "record", label: "Record" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "ip", label: "IP address", kind: "mono", detailOnly: true },
    ],
    rows: auditRows,
    stats: [
      { label: "Events", value: String(auditRows.length) },
      { label: "Voids and refunds", value: String(auditRows.filter((row) => row.action === "Invoice voided" || row.action === "Payment refunded").length) },
    ],
  },
  {
    slug: "report-schedules",
    title: "Scheduled & export",
    singular: "Scheduled report",
    description: "Finance reports emailed automatically, and the formats they are sent in.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Schedule" },
      { key: "report", label: "Report" },
      { key: "frequency", label: "Sent" },
      { key: "format", label: "Format" },
      { key: "recipients", label: "To" },
      { key: "lastRun", label: "Last sent", kind: "date" },
      { key: "nextRun", label: "Next", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: scheduleRows,
    stats: [{ label: "Active schedules", value: String(countWhere(scheduleRows, "status", "Active")) }],
    form: [{ title: "Schedule a report", fields: [
      { name: "name", label: "Name", required: true },
      { name: "report", label: "Report", type: "select", options: FINANCE_REPORT_NAMES, required: true },
      { name: "frequency", label: "Send", type: "select", options: ["Daily", "Weekly", "Monthly", "Quarterly", "Per term"] },
      { name: "format", label: "Format", type: "select", options: ["PDF", "Excel", "CSV"] },
      { name: "section", label: "Limit to class (optional)", type: "select", options: CLASSES },
      { name: "recipients", label: "Email to", placeholder: "principal@spsarmyschool.edu.pk", wide: true },
    ] }],
    createLabel: "Schedule a report",
  },
];

/** Every accountant finance screen added on top of the core resources. */
export const financeResources: Resource[] = [
  ...expensesModule,
  ...payrollModule,
  ...budgetsModule,
  ...studentsModule,
  ...reportsModule,
];
