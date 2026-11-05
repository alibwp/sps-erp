// Deterministic demo data. Every screen reads from here until the backend API
// is connected, so the generators are seeded: the server and the browser
// produce the same rows and hydration never mismatches.

/** The fixed "today" the demo data is built around. */
export const DEMO_TODAY = "2026-11-05";

export const SCHOOL = {
  name: "SPS Army School",
  campus: "Main Campus, Rawalpindi",
  organization: "SPS Education System",
  academicYear: "2026/2027",
  term: "First Term",
  email: "office@spsarmyschool.edu.pk",
  phone: "+92 51 555 0142",
};

export const CURRENT_USER = {
  name: "Azeem Abbasi",
  email: "admin@spsarmyschool.edu.pk",
  role: "Super admin",
};

export function createRandom(seed: number) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)];

  return {
    next,
    int,
    pick,
    chance: (probability: number) => next() < probability,
    /** An ISO date `offset` days from DEMO_TODAY, chosen between min and max. */
    date: (minOffset: number, maxOffset: number) => shiftDate(DEMO_TODAY, int(minOffset, maxOffset)),
    phone: () => `+92 3${int(0, 4)}${int(0, 9)} ${int(1000000, 9999999)}`,
    money: (min: number, max: number, step = 500) => Math.round(int(min, max) / step) * step,
  };
}

export function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const FIRST_NAMES = [
  "Ayesha", "Hamza", "Fatima", "Ali", "Zainab", "Usman", "Maryam", "Bilal", "Hira", "Ahmed",
  "Sana", "Hassan", "Iqra", "Saad", "Mahnoor", "Omar", "Areeba", "Talha", "Noor", "Daniyal",
  "Khadija", "Abdullah", "Eman", "Shayan", "Laiba", "Fahad", "Anaya", "Rayyan", "Amna", "Zaid",
];

const LAST_NAMES = [
  "Khan", "Ahmed", "Malik", "Hussain", "Qureshi", "Butt", "Chaudhry", "Siddiqui", "Raza", "Abbasi",
  "Sheikh", "Mirza", "Javed", "Iqbal", "Rana", "Hashmi", "Awan", "Baig", "Farooq", "Shah",
];

const FEMALE_NAMES = new Set([
  "Ayesha", "Fatima", "Zainab", "Maryam", "Hira", "Sana", "Iqra", "Mahnoor", "Areeba", "Noor",
  "Khadija", "Eman", "Laiba", "Anaya", "Amna",
]);

/** "Male" or "Female" from a person's first name (ignoring any title). */
export function genderOf(name: string): "Male" | "Female" {
  const first = name.replace(/^(Mr|Ms|Mrs|Dr)\.\s+/, "").split(" ")[0];
  return FEMALE_NAMES.has(first) ? "Female" : "Male";
}

export const CLASSES = [
  "Nursery", "Prep", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5",
  "Class 6", "Class 7", "Class 8", "Class 9", "Class 10",
];

export const SECTION_LETTERS = ["A", "B", "C"];

export const SECTIONS = CLASSES.slice(2).flatMap((level) =>
  SECTION_LETTERS.slice(0, 2).map((letter) => `${level} ${letter}`),
);

export const SUBJECTS = [
  "English", "Urdu", "Mathematics", "General Science", "Physics", "Chemistry", "Biology",
  "Computer Science", "Islamiat", "Pakistan Studies", "Social Studies", "Art & Design",
];

export const SUBJECT_CODES: Record<string, string> = {
  English: "ENG", Urdu: "URD", Mathematics: "MTH", "General Science": "SCI", Physics: "PHY",
  Chemistry: "CHE", Biology: "BIO", "Computer Science": "CSC", Islamiat: "ISL",
  "Pakistan Studies": "PST", "Social Studies": "SST", "Art & Design": "ART",
};

function makePeople(seed: number, count: number, withTitle = false) {
  const random = createRandom(seed);
  const used = new Set<string>();
  const people: string[] = [];
  while (people.length < count) {
    const name = `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
    if (used.has(name)) continue;
    used.add(name);
    const title = random.chance(0.2) ? "Dr." : genderOf(name) === "Female" ? random.pick(["Ms.", "Mrs."]) : "Mr.";
    people.push(withTitle ? `${title} ${name}` : name);
  }
  return people;
}

export const STUDENT_NAMES = makePeople(11, 48);
export const TEACHER_NAMES = makePeople(23, 16, true);
export const PARENT_NAMES = makePeople(37, 30);
export const STAFF_NAMES = makePeople(53, 12);

export function emailFor(name: string, domain = "spsarmyschool.edu.pk"): string {
  return `${name.replace(/^(Mr|Ms|Mrs|Dr)\.\s+/, "").toLowerCase().replace(/[^a-z]+/g, ".")}@${domain}`;
}

/** Build `count` rows with ids "1".."count" from a seeded generator. */
export function rows<T extends Record<string, unknown>>(
  seed: number,
  count: number,
  build: (index: number, random: ReturnType<typeof createRandom>) => T,
): Array<T & { id: string }> {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, index) => ({ id: String(index + 1), ...build(index, random) }));
}
