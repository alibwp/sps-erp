// The family portal ("My school"): the read-only pages a student, or a parent
// for their child, sees about one enrollment. Mirrors the reference's portal
// areas and their order. Data is demo data built around one learner, drawn
// from the same mock records the staff pages show where they exist.

import {
  BedDouble,
  BookOpen,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  Clock,
  FileText,
  GraduationCap,
  Library,
  Megaphone,
  MessageSquare,
  Receipt,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { createRandom, DEMO_TODAY, SCHOOL, SECTIONS, shiftDate, STUDENT_NAMES, TEACHER_NAMES } from "@/lib/mock";
import { getResource } from "@/lib/resources";
import type { RoleId } from "@/lib/roles";

export type PortalAreaId =
  | "results"
  | "attendance"
  | "timetable"
  | "calendar"
  | "notices"
  | "invoices"
  | "documents"
  | "requests"
  | "library"
  | "boarding"
  | "graduation"
  | "programmes"
  | "syllabi";

export type PortalArea = { id: PortalAreaId; label: string; icon: LucideIcon; href: string };

/** Every portal area, in the reference's menu order. */
export const PORTAL_AREAS: PortalArea[] = [
  { id: "results", label: "Results", icon: ChartColumn },
  { id: "attendance", label: "Attendance", icon: ClipboardCheck },
  { id: "timetable", label: "Timetable", icon: Clock },
  { id: "calendar", label: "School calendar", icon: CalendarDays },
  { id: "notices", label: "Notices", icon: Megaphone },
  { id: "invoices", label: "Invoices and payments", icon: Receipt },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "requests", label: "Requests", icon: MessageSquare },
  { id: "library", label: "Library", icon: Library },
  { id: "boarding", label: "Boarding", icon: BedDouble },
  { id: "graduation", label: "Graduation progress", icon: GraduationCap },
  { id: "programmes", label: "Programmes", icon: Sparkles },
  { id: "syllabi", label: "Syllabi", icon: BookOpen },
].map((area) => ({ ...area, id: area.id as PortalAreaId, href: `/portal/${area.id}` }));

export const PORTAL_HOME = "/portal";
export const NOTIFICATION_SETTINGS = "/portal/notification-preferences";

export function getPortalArea(id: string): PortalArea | undefined {
  return PORTAL_AREAS.find((area) => area.id === id);
}

/**
 * The learners whose portal a role reads, by position in the demo student
 * list. A student reads their own enrollment; a parent reads their children's.
 * Roles not listed have no portal.
 *
 * As in the reference demo, the demo parent has one child: the demo student
 * (whose guardian on the student record is the parent's name).
 */
const PORTAL_LEARNERS: Partial<Record<RoleId, number[]>> = {
  student: [0],
  parent: [0],
};

export function portalLearnersFor(role: RoleId): number[] {
  return PORTAL_LEARNERS[role] ?? [];
}

/** Whether a role has a "My school" portal at all. */
export function hasPortal(role: RoleId): boolean {
  return portalLearnersFor(role).length > 0;
}

/** The audiences of school-wide records a family member is shown. */
const FAMILY_AUDIENCES = new Set(["Everyone", "Students", "Parents"]);

export type PortalLearner = ReturnType<typeof portalLearner>;

/**
 * Everything the portal shows about one learner. `index` is the learner's
 * position in the demo student list, so the student record (row index + 1)
 * and the portal agree.
 */
export function portalLearner(index: number) {
  const random = createRandom(9000 + index);
  const name = STUDENT_NAMES[index];
  const section = SECTIONS[index % SECTIONS.length];
  const level = section.replace(/ [A-C]$/, "");
  const school = `${SCHOOL.name} — Main Campus`;
  const teacher = (offset: number) => TEACHER_NAMES[(index + offset) % TEACHER_NAMES.length];

  const subjects = ["English", "Urdu", "Mathematics", "General Science", "Islamiat", "Social Studies", "Computer Science"];

  const results = subjects.map((subject) => ({
    subject,
    term: `${SCHOOL.term} ${SCHOOL.academicYear}`,
    score: random.int(58, 98) + (random.chance(0.4) ? 0.5 : 0),
    approved: shiftDate(DEMO_TODAY, -random.int(3, 9)),
  }));

  const attendance = { kind: "daily" as const, present: 52, absent: 3, late: 4, excused: 2 };
  const recorded = attendance.present + attendance.absent + attendance.late + attendance.excused;

  const slots = [
    ["08:00", "08:40"],
    ["08:40", "09:20"],
    ["09:20", "10:00"],
    ["10:30", "11:10"],
    ["11:10", "11:50"],
    ["11:50", "12:30"],
  ];
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const week = weekdays.map((weekday, day) => ({
    weekday,
    lessons: slots.slice(0, day === 4 ? 4 : 6).map(([start, stop], slot) => {
      const subjectIndex = (day * 2 + slot) % subjects.length;
      return {
        start,
        stop,
        name: subjects[subjectIndex],
        teachers: [teacher(subjectIndex)],
        timetable: `${section} timetable`,
      };
    }),
  }));

  const calendarEvents = (getResource("calendar-events")?.rows ?? [])
    .filter((event) => FAMILY_AUDIENCES.has(String(event.audience)))
    .map((event) => ({
      id: event.id,
      title: String(event.title),
      date: String(event.date),
      time: String(event.time),
      kind: String(event.kind),
      location: String(event.location) === "—" ? "" : String(event.location),
    }));

  const notices = (getResource("notices")?.rows ?? [])
    .filter((notice) => notice.status === "Published" && FAMILY_AUDIENCES.has(String(notice.audience)))
    .map((notice) => ({
      id: notice.id,
      title: String(notice.title),
      sent: String(notice.starts),
      until: String(notice.ends),
      body: String(notice.body),
      attachment: Number(notice.id) % 3 === 0,
    }));

  const invoiceRows = (getResource("fee-invoices")?.rows ?? []).filter((invoice) => invoice.student === name);
  const invoices = [
    { name: "Admission and annual charges 2026/2027", issued: "2026-04-02", due: "2026-04-20", total: 45000, balance: 0 },
    { name: "Tuition fee — August 2026", issued: "2026-08-01", due: "2026-08-15", total: 24000, balance: 0 },
    ...invoiceRows.map((invoice) => ({
      name: `Tuition fee — ${String(invoice.number)}`,
      issued: String(invoice.issued),
      due: String(invoice.due),
      total: Number(invoice.amount),
      balance: Number(invoice.amount) - Number(invoice.paid),
    })),
  ];
  const balance = invoices.reduce((sum, invoice) => sum + invoice.balance, 0);

  const transcriptRow = (getResource("transcripts")?.rows ?? []).find((row) => row.student === name);

  const reportCards = [
    { period: "Final Term 2025/2026", revision: 1, published: "2026-03-28" },
    { period: `Mid-term ${SCHOOL.academicYear}`, revision: 2, published: shiftDate(DEMO_TODAY, -6) },
  ];

  // The requests on this enrollment, seen by the student and their parent
  // alike. As in the reference demo: one open, one the office answered.
  const firstName = name.split(" ")[0];
  const requests = [
    {
      id: "r2",
      subject: `Update ${firstName}'s emergency contact`,
      type: "Correction request",
      sent: DEMO_TODAY,
      status: "Open",
      message: "Our home phone changed. Please use +92 51 555 0147 as the emergency contact number from now on.",
      response: "",
      answered: "",
    },
    {
      id: "r1",
      subject: "Enrollment letter for a summer program",
      type: "Document request",
      sent: shiftDate(DEMO_TODAY, -6),
      status: "Answered",
      message: `${firstName} is applying to a summer science camp. Could the office send a letter that confirms ${firstName} attends ${SCHOOL.name}?`,
      response: "The letter is signed and ready. Pick it up at the front office, or we can email a PDF copy if you prefer.",
      answered: shiftDate(DEMO_TODAY, -5),
    },
  ];

  const loans = [
    { title: "The Secret Garden", copy: "LIB-00412", due: shiftDate(DEMO_TODAY, 6) },
    { title: "Wings of Fire", copy: "LIB-00877", due: shiftDate(DEMO_TODAY, -2) },
  ];
  const reservations = [{ title: "Matilda", status: "Ready to collect", holdsUntil: shiftDate(DEMO_TODAY, 3) }];

  const boarding = {
    place: "Jinnah House · Room 4 · Bed B",
    latestRoll: { type: "Evening roll", takenOn: shiftDate(DEMO_TODAY, -1), status: "Present" },
  };

  const graduation = [
    {
      name: "Primary school completion",
      description: "Requirements the school checks before a learner moves up to Class 6.",
      group: `${level} cohort`,
      complete: false,
      creditsEarned: 12,
      creditsRequired: 20,
      stages: [
        { name: "Lower primary (Class 1–2)", complete: false, requiredCredits: 8, stages: [] as { name: string; complete: boolean; requiredCredits: number | null }[] },
        { name: "Upper primary (Class 3–5)", complete: false, requiredCredits: 12, stages: [] },
      ],
      requirements: [
        { description: "Pass English in every year", negated: false, percentage: 78, state: "met" },
        { description: "Pass Mathematics in every year", negated: false, percentage: 84.5, state: "met" },
        { description: "Pass Urdu in every year", negated: false, percentage: null, state: "no_result" },
        { description: "Attend at least 85% of school days", negated: false, percentage: 91.8, state: "not_judged" },
      ],
    },
  ];

  const programmes = [
    {
      name: "Junior Art Club",
      type: "Club",
      status: "Active",
      description: "Drawing, painting and craft for primary learners.",
      schedule: "Wednesdays 13:00–14:00",
      starts: "2026-09-02",
      ends: "2027-03-31",
    },
    {
      name: "Under-10 Football",
      type: "Sport",
      status: "Active",
      description: "Weekly training and inter-house matches.",
      schedule: "Saturdays 09:00–10:30",
      starts: "2026-09-05",
      ends: "",
    },
  ];

  const syllabusSubjects = ["English", "Mathematics", "General Science"];
  const currentWeek = 10;
  const syllabi = syllabusSubjects.map((subject, s) => {
    const topics = Array.from({ length: 6 }, (_, t) => {
      const weekNo = 7 + t;
      const status = weekNo < currentWeek ? (s === 1 && weekNo === 9 ? "Not yet taught" : "Taught") : weekNo === currentWeek ? "In progress" : "Not yet taught";
      return {
        week: weekNo,
        title: `${subject} unit ${t + 4}`,
        objectives: t % 2 === 0 ? `Learners can apply the ideas of unit ${t + 4} in class work.` : "",
        status,
      };
    });
    const covered = topics.filter((topic) => topic.status === "Taught").length;
    const expected = topics.filter((topic) => topic.week < currentWeek).length;
    return {
      subject,
      name: `${subject} — ${level}`,
      period: `${SCHOOL.term} ${SCHOOL.academicYear}`,
      description: "",
      currentWeek,
      summary: { covered, total: topics.length, expected, behind: Math.max(0, expected - covered) },
      topics,
    };
  });

  return {
    index,
    recordId: String(index + 1),
    name,
    admissionNumber: `SPS/${2020 + (index % 7)}/${String(1001 + index)}`,
    status: "Active",
    section,
    school,
    results,
    attendance: { ...attendance, recorded, rate: Math.round(((attendance.present + attendance.late) / recorded) * 100) },
    week,
    calendarEvents,
    notices,
    invoices,
    balance,
    credit: 0,
    reportCards,
    transcript: transcriptRow ? { revision: 1, issued: String(transcriptRow.issued) } : null,
    requests,
    loans,
    reservations,
    boarding,
    graduation,
    programmes,
    syllabi,
  };
}
