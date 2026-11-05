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

/** Every page link with its group, for the command palette. */
export const commandItems = navigation.flatMap((group) =>
  group.items.flatMap((item) =>
    "children" in item
      ? item.children.map((child) => ({ ...child, group: `${group.label} · ${item.label}` }))
      : [{ ...item, group: group.label }],
  ),
);

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
