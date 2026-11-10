// Demo entries for the activity log, newest first. Shared by the activity
// logs page and the platform administrator's dashboard.

import { DEMO_TODAY, createRandom, shiftDate } from "@/lib/mock";

export type LogLevel = "Info" | "Warning" | "Error";

export type LogEntry = { level: LogLevel; message: string; date: string; time: string; ip: string };

const random = createRandom(909);

const ACTIONS: { level: LogLevel; message: string }[] = [
  { level: "Info", message: "Azeem Abbasi signed in" },
  { level: "Info", message: "Adil Mehmood updated student Ayesha Khan" },
  { level: "Info", message: "Kamran Butt recorded a payment of Rs 21,000 on INV-2026-1204" },
  { level: "Warning", message: "Five failed sign-in attempts for teacher@spsarmyschool.edu.pk" },
  { level: "Info", message: "Sadia Raza published the notice “Winter uniform from 15 November”" },
  { level: "Error", message: "Email delivery failed for 2 invitation messages" },
  { level: "Info", message: "Timetable Class 6 A published" },
  { level: "Info", message: "Import students-class-6.csv completed: 112 rows" },
  { level: "Warning", message: "Budget “Utilities” passed 85% of its plan" },
  { level: "Info", message: "Marks submitted for Mathematics · Class 9 A" },
  { level: "Info", message: "Nightly backup completed" },
  { level: "Error", message: "Report card PDF failed to render for Class 10 B" },
];

export const ACTIVITY_LOG: LogEntry[] = ACTIONS.map((action, index) => ({
  ...action,
  date: shiftDate(DEMO_TODAY, -Math.floor(index / 3)),
  time: `${String(random.int(7, 17)).padStart(2, "0")}:${String(random.int(0, 59)).padStart(2, "0")}`,
  ip: `182.185.${random.int(1, 254)}.${random.int(1, 254)}`,
}));

export const LOG_TONES = { Info: "neutral", Warning: "warning", Error: "danger" } as const;
