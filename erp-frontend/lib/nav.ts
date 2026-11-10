import {
  Award,
  BedDouble,
  Bell,
  BookMarked,
  BookOpenCheck,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  CalendarRange,
  CircleArrowUp,
  ClipboardCheck,
  ClipboardPenLine,
  Clock,
  DollarSign,
  FileBadge,
  FileText,
  Gauge,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  House,
  Landmark,
  Library,
  Lightbulb,
  List,
  ListChecks,
  ListOrdered,
  Mail,
  MessageSquare,
  Moon,
  Plane,
  Presentation,
  Receipt,
  School,
  ScrollText,
  Settings,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Upload,
  User,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { hasPortal, NOTIFICATION_SETTINGS, PORTAL_AREAS, PORTAL_HOME } from "@/lib/portal";
import type { RoleId } from "@/lib/roles";

export type NavLink = { label: string; href: string; icon: LucideIcon };
export type NavItem = NavLink | { label: string; icon: LucideIcon; children: NavLink[] };
export type NavGroup = { label: string; items: NavItem[] };

export const navigation: NavGroup[] = [
  {
    label: "Workspace",
    items: [{ label: "Dashboard", href: "/dashboard", icon: Gauge }],
  },
  {
    label: "Organization",
    items: [
      { label: "Organizations", href: "/organizations", icon: Building2 },
      { label: "Schools", href: "/schools", icon: School },
      { label: "Calendar templates", href: "/calendar-templates", icon: CalendarRange },
    ],
  },
  {
    label: "Setup",
    items: [
      { label: "School settings", href: "/school-settings", icon: Settings },
      { label: "School years", href: "/academic-years", icon: Calendar },
      { label: "Classes", href: "/academic-levels", icon: Presentation },
      { label: "Sections", href: "/academic-cycle-sections", icon: Landmark },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Students", href: "/students", icon: User },
      { label: "Admissions waitlist", href: "/admissions-waitlist", icon: ListOrdered },
      { label: "Record sharing", href: "/data-sharing-requests", icon: Share2 },
      { label: "Campus moves", href: "/campus-moves", icon: Building2 },
      { label: "Teachers", href: "/teachers", icon: GraduationCap },
      { label: "Parents", href: "/parents", icon: Users },
      { label: "Groups", href: "/cohorts", icon: UsersRound },
      { label: "Graduation plans", href: "/graduation-plans", icon: GraduationCap },
      { label: "Promotions", href: "/promotions", icon: CircleArrowUp },
      { label: "Graduations", href: "/graduations", icon: Award },
      { label: "Programmes", href: "/programs", icon: Sparkles },
      { label: "Administrators", href: "/admins", icon: ShieldCheck },
      { label: "Account invitations", href: "/account-invitations", icon: Mail },
    ],
  },
  {
    label: "Teaching",
    items: [
      { label: "Subjects", href: "/subjects", icon: Lightbulb },
      { label: "Subjects being taught", href: "/course-offerings", icon: BookMarked },
      { label: "Syllabi", href: "/syllabi", icon: List },
      { label: "Timetables", href: "/timetables", icon: ListChecks },
      { label: "Attendance", href: "/attendance", icon: ClipboardCheck },
    ],
  },
  {
    label: "Assessment",
    items: [
      { label: "Gradebooks", href: "/gradebooks", icon: ClipboardPenLine },
      { label: "Exam schedules", href: "/exams", icon: CalendarDays },
      { label: "Rankings", href: "/rankings", icon: ListOrdered },
      { label: "Grading scales", href: "/grading-scales", icon: GraduationCap },
      { label: "Report cards", href: "/report-cards", icon: FileBadge },
      { label: "Transcripts", href: "/transcripts", icon: ScrollText },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Reports", href: "/reports", icon: FileText },
      { label: "Family requests", href: "/portal-requests", icon: MessageSquare },
      { label: "Calendar", href: "/calendar-events", icon: CalendarDays },
      { label: "Notices", href: "/notices", icon: Bell },
      { label: "Cases", href: "/incidents", icon: ShieldAlert },
      {
        label: "Student support",
        icon: HeartHandshake,
        children: [
          { label: "Support plans", href: "/support-plans", icon: HeartHandshake },
          { label: "Health records", href: "/health-records", icon: HeartPulse },
        ],
      },
      {
        label: "Staff",
        icon: Briefcase,
        children: [
          { label: "Staff directory", href: "/staff-profiles", icon: Briefcase },
          { label: "Staff leave", href: "/staff-leave", icon: Plane },
        ],
      },
      {
        label: "Finance",
        icon: DollarSign,
        children: [
          { label: "Fee invoices", href: "/fee-invoices", icon: Receipt },
          { label: "Fee categories", href: "/fee-categories", icon: List },
          { label: "Fees", href: "/fees", icon: DollarSign },
          { label: "Budgets", href: "/budgets", icon: Wallet },
          { label: "Expenses", href: "/expenses", icon: Receipt },
          { label: "Cash deposits", href: "/cash-deposits", icon: Landmark },
        ],
      },
      {
        label: "Boarding",
        icon: BedDouble,
        children: [
          { label: "Houses", href: "/dormitories", icon: House },
          { label: "Nights away", href: "/overnight-leaves", icon: Moon },
        ],
      },
      { label: "Facilities", href: "/facilities", icon: Building2 },
      {
        label: "Library",
        icon: Library,
        children: [
          { label: "Catalogue", href: "/library-copies", icon: Library },
          { label: "Lending desk", href: "/library-loans", icon: BookOpenCheck },
          { label: "Library queue", href: "/library-reservations", icon: Clock },
        ],
      },
      { label: "Imports", href: "/imports", icon: Upload },
      { label: "Roles", href: "/roles", icon: ShieldCheck },
    ],
  },
  {
    label: "System",
    items: [{ label: "Activity logs", href: "/activity-logs", icon: StickyNote }],
  },
];

/**
 * Pages each role does not see, matching the reference sidebar for that role.
 * A role not listed here sees every page (the platform administrator, and the
 * roles whose screens are not built yet).
 *
 * School administrator: the reference hides what needs organization or
 * platform authority (Organizations, Schools, Calendar templates,
 * Administrators, Activity logs), health records (no "read health record"),
 * the finance pages its sidebar does not list, and Rankings, which the demo
 * school leaves turned off (it turns Boarding and Library on).
 */
const HIDDEN_PAGES: Partial<Record<RoleId, string[]>> = {
  "school-admin": [
    "/organizations",
    "/schools",
    "/calendar-templates",
    "/admins",
    "/health-records",
    "/rankings",
    "/fee-categories",
    "/fees",
    "/expenses",
    "/cash-deposits",
    "/activity-logs",
  ],
};

/**
 * For roles that see only a few pages, the sidebar pages they do see; every
 * other page is hidden. Matches the reference sidebar for that role.
 *
 * Accountant: Students ("read student"), Report cards, Transcripts and
 * Reports ("read report"), and the two finance pages the reference lists.
 *
 * Librarian: Students ("read student") and the three library pages ("read
 * library", "manage library", "lend library item").
 */
const VISIBLE_PAGES: Partial<Record<RoleId, string[]>> = {
  accountant: ["/dashboard", "/students", "/report-cards", "/transcripts", "/reports", "/fee-invoices", "/budgets"],
  librarian: ["/dashboard", "/students", "/library-copies", "/library-loans", "/library-reservations"],
  // Teacher: Students, Syllabi, Timetables, Attendance, Gradebooks, Exam
  // schedules, Calendar and Notices. Rankings ("read ranking") stays hidden
  // because the demo school leaves rankings turned off.
  teacher: [
    "/dashboard",
    "/students",
    "/syllabi",
    "/timetables",
    "/attendance",
    "/gradebooks",
    "/exams",
    "/calendar-events",
    "/notices",
  ],
  // Student: a portal-only person. Their own records live under "My school";
  // of the staff pages the reference keeps only Syllabi and Timetables
  // ("read syllabus", "read timetable"). Notices, Calendar and Fee invoices
  // are hidden from portal-only people, who read them in the portal instead.
  student: ["/dashboard", "/syllabi", "/timetables"],
  // Parent: portal-only too, and the reference also hides Syllabi and
  // Timetables from someone who reads learners only as their guardian. So
  // a parent sees Dashboard and "My school", nothing more.
  parent: ["/dashboard"],
};

/**
 * Hidden pages a role may still open from a link elsewhere, as in the
 * reference: the role holds the permission, only the sidebar leaves the page
 * out (School settings and the finance pages link to these).
 */
const STILL_OPENABLE: Partial<Record<RoleId, string[]>> = {
  "school-admin": ["/fee-categories", "/fees", "/expenses", "/cash-deposits"],
  accountant: ["/fee-categories", "/fees", "/expenses", "/cash-deposits"],
};

/**
 * Pages a role may read but not change: the guard keeps it off their create
 * and edit screens. The accountant only reads students and budgets; the
 * librarian only reads students; the teacher reads students, exam schedules,
 * the calendar and notices, and writes syllabi, timetables and gradebooks.
 */
const READ_ONLY: Partial<Record<RoleId, string[]>> = {
  accountant: ["/students", "/budgets"],
  librarian: ["/students"],
  teacher: ["/students", "/exams", "/calendar-events", "/notices"],
  student: ["/syllabi", "/timetables"],
};

/**
 * The "My school" group a portal role sees under Dashboard, as the reference
 * lists it: every open portal area, then notification settings.
 */
const portalGroup: NavGroup = {
  label: "My school",
  items: [
    ...PORTAL_AREAS.map(({ label, href, icon }) => ({ label, href, icon })),
    { label: "Notification settings", href: NOTIFICATION_SETTINGS, icon: Bell },
  ],
};

const ALL_PAGES = navigation.flatMap((group) =>
  group.items.flatMap((item) => ("children" in item ? item.children.map((child) => child.href) : [item.href])),
);

/** The sidebar pages hidden from one role. */
function hiddenPages(role: RoleId): string[] {
  const visible = VISIBLE_PAGES[role];
  if (visible) return ALL_PAGES.filter((href) => !visible.includes(href));
  return HIDDEN_PAGES[role] ?? [];
}

/** Whether this role may add, edit or delete the records under `pathname`. */
export function canChange(role: RoleId, pathname: string): boolean {
  return !(READ_ONLY[role] ?? []).some((href) => isActive(pathname, href));
}

/** Whether this role may open the page at `pathname`. */
export function canOpen(role: RoleId, pathname: string): boolean {
  // The portal belongs to the people it describes: students and parents.
  if (isActive(pathname, PORTAL_HOME)) return hasPortal(role);
  if (/\/(create|edit)$/.test(pathname) && !canChange(role, pathname)) return false;
  const openable = STILL_OPENABLE[role] ?? [];
  return !hiddenPages(role).some((href) => !openable.includes(href) && isActive(pathname, href));
}

/** The sidebar for one role: "My school" for portal roles, then the staff pages it may see. */
export function navigationFor(role: RoleId): NavGroup[] {
  const staff = staffNavigationFor(role);
  if (!hasPortal(role)) return staff;
  // As in the reference, "My school" follows Dashboard.
  return [staff[0], portalGroup, ...staff.slice(1)];
}

/** The staff sidebar for one role: hidden pages removed, then empty menus and groups. */
function staffNavigationFor(role: RoleId): NavGroup[] {
  const hidden = new Set(hiddenPages(role));
  if (hidden.size === 0) return navigation;

  return navigation
    .map((group) => ({
      ...group,
      items: group.items
        .map((item): NavItem | null => {
          if (!("children" in item)) return hidden.has(item.href) ? null : item;
          const children = item.children.filter((child) => !hidden.has(child.href));
          return children.length > 0 ? { ...item, children } : null;
        })
        .filter((item): item is NavItem => item !== null),
    }))
    .filter((group) => group.items.length > 0);
}

export type CommandItem = { label: string; href: string; group: string };

/** Every page link one role can open, with its group, for the command palette. */
export function commandItemsFor(role: RoleId): CommandItem[] {
  return navigationFor(role).flatMap((group) =>
    group.items.flatMap((item): CommandItem[] =>
      "children" in item
        ? item.children.map((child) => ({ label: child.label, href: child.href, group: `${group.label} · ${item.label}` }))
        : [{ label: item.label, href: item.href, group: group.label }],
    ),
  );
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
