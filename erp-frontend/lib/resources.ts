// One entry per screen family (list → record → create/edit). The generic
// resource pages read everything they show from here, so wiring a screen to
// the backend later means replacing its `rows` with an API call.

import {
  CLASSES,
  DEMO_TODAY,
  PARENT_NAMES,
  SCHOOL,
  SECTIONS,
  STAFF_NAMES,
  STUDENT_NAMES,
  SUBJECTS,
  SUBJECT_CODES,
  TEACHER_NAMES,
  emailFor,
  genderOf,
  rows,
  shiftDate,
} from "@/lib/mock";

export type CellValue = string | number | null;
export type Row = { id: string } & Record<string, CellValue>;

export type ColumnKind = "text" | "person" | "badge" | "money" | "date" | "number" | "mono" | "percent";

export type Column = {
  key: string;
  label: string;
  kind?: ColumnKind;
  /** For `person` columns: a second key shown under the name. */
  sub?: string;
  /** Hide on the list but keep on the record page. */
  detailOnly?: boolean;
};

export type FieldType =
  | "text" | "email" | "tel" | "date" | "time" | "number" | "select"
  | "textarea" | "file" | "checkbox" | "password" | "color";

export type Field = {
  name: string;
  label: string;
  type?: FieldType;
  options?: readonly string[];
  placeholder?: string;
  help?: string;
  required?: boolean;
  /** Take the full width of the two-column form grid. */
  wide?: boolean;
};

export type FieldGroup = { title: string; description?: string; fields: Field[] };

/** Screens whose record page needs more than the generic detail layout. */
export type DetailView = "timetable" | "invoice" | "marksheet" | "report-card" | "permissions" | "person";

export type Resource = {
  slug: string;
  title: string;
  singular: string;
  description: string;
  titleKey: string;
  columns: Column[];
  rows: Row[];
  /** Absent for read-only screens (logs, rankings, …). */
  form?: FieldGroup[];
  createLabel?: string;
  submitLabel?: string;
  view?: DetailView;
  /** Lists shown under a record, filtered where `matchKey` equals the record title. */
  related?: { slug: string; matchKey: string; title?: string }[];
};

// ---------------------------------------------------------------------------
// Shared field sets
// ---------------------------------------------------------------------------

const GENDERS = ["Male", "Female", "Prefer not to say"] as const;

const personFields: FieldGroup = {
  title: "Personal details",
  description: "Identity and contact details. They get an email with a link to set their own password.",
  fields: [
    { name: "photo", label: "Profile picture", type: "file", wide: true },
    { name: "name", label: "Full name", required: true, placeholder: "Ayesha Khan" },
    { name: "email", label: "Email address", type: "email", required: true, placeholder: "ayesha.khan@example.com" },
    { name: "birthday", label: "Date of birth", type: "date" },
    { name: "gender", label: "Gender", type: "select", options: GENDERS },
    { name: "phone", label: "Phone number", type: "tel", placeholder: "+92 300 1234567" },
    { name: "nationality", label: "Nationality", placeholder: "Pakistani" },
    { name: "address", label: "Address line 1", placeholder: "House 12, Street 4" },
    { name: "addressLine2", label: "Address line 2", placeholder: "Sector F-7" },
    { name: "city", label: "City", placeholder: "Rawalpindi" },
    { name: "postalCode", label: "Postal code", placeholder: "46000" },
  ],
};

const TERMS = ["First Term", "Second Term", "Third Term"] as const;
const YEARS = ["2026/2027", "2025/2026", "2024/2025"] as const;

const pickName = (names: string[], index: number) => names[index % names.length];

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

const list: Resource[] = [
  // ----- Organization ------------------------------------------------------
  {
    slug: "organizations",
    title: "Organizations",
    singular: "Organization",
    description: "An organization groups the campuses that share policies, calendars and billing.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code", kind: "mono" },
      { key: "schools", label: "Campuses", kind: "number" },
      { key: "students", label: "Students", kind: "number" },
      { key: "email", label: "Email" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(101, 3, (i, r) => ({
      name: ["SPS Education System", "SPS Girls Wing", "SPS Cantonment Schools"][i],
      code: ["SPS", "SPSG", "SPSC"][i],
      schools: [4, 2, 3][i],
      students: r.int(800, 3200),
      email: ["office@sps.edu.pk", "girls@sps.edu.pk", "cantt@sps.edu.pk"][i],
      status: "Active",
    })),
    form: [
      {
        title: "Organization",
        fields: [
          { name: "name", label: "Name", required: true, placeholder: "SPS Education System" },
          { name: "code", label: "Short code", placeholder: "SPS" },
          { name: "email", label: "Email", type: "email" },
          { name: "phone", label: "Phone", type: "tel" },
          { name: "address", label: "Head office address", wide: true },
        ],
      },
    ],
    createLabel: "Add organization",
    related: [{ slug: "schools", matchKey: "organization" }],
  },
  {
    slug: "schools",
    title: "Schools",
    singular: "School",
    description: "Each campus keeps its own students, staff and timetable.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name", kind: "person", sub: "city" },
      { key: "code", label: "Code", kind: "mono" },
      { key: "organization", label: "Organization" },
      { key: "students", label: "Students", kind: "number" },
      { key: "teachers", label: "Teachers", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
      { key: "city", label: "City", detailOnly: true },
      { key: "email", label: "Email", detailOnly: true },
      { key: "phone", label: "Phone", detailOnly: true },
    ],
    rows: rows(102, 6, (i, r) => ({
      name: ["SPS Army School — Main Campus", "SPS Army School — Westridge", "SPS Girls Campus", "SPS Junior School", "SPS Cantt Campus", "SPS Chaklala Campus"][i],
      code: ["SPS-MC", "SPS-WR", "SPS-GC", "SPS-JS", "SPS-CC", "SPS-CK"][i],
      organization: ["SPS Education System", "SPS Education System", "SPS Girls Wing", "SPS Education System", "SPS Cantonment Schools", "SPS Cantonment Schools"][i],
      city: ["Rawalpindi", "Rawalpindi", "Islamabad", "Rawalpindi", "Lahore", "Rawalpindi"][i],
      students: r.int(320, 1400),
      teachers: r.int(18, 70),
      email: `campus${i + 1}@sps.edu.pk`,
      phone: `+92 51 555 01${40 + i}`,
      status: i === 5 ? "Setting up" : "Active",
    })),
    form: [
      {
        title: "School details",
        fields: [
          { name: "name", label: "School name", required: true },
          { name: "code", label: "Code", placeholder: "SPS-MC" },
          { name: "organization", label: "Organization", type: "select", options: ["SPS Education System", "SPS Girls Wing", "SPS Cantonment Schools"] },
          { name: "email", label: "Email", type: "email" },
          { name: "phone", label: "Phone", type: "tel" },
          { name: "logo", label: "Logo", type: "file" },
        ],
      },
      {
        title: "Address",
        fields: [
          { name: "address", label: "Address", wide: true },
          { name: "city", label: "City" },
          { name: "country", label: "Country", type: "select", options: ["Pakistan"] },
        ],
      },
    ],
    createLabel: "Add school",
  },
  {
    slug: "calendar-templates",
    title: "Calendar templates",
    singular: "Calendar template",
    description: "Shared term dates and holidays that campuses copy into their calendars.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "year", label: "Academic year" },
      { key: "events", label: "Events", kind: "number" },
      { key: "campuses", label: "Campuses using it", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(103, 4, (i, r) => ({
      name: ["Federal board calendar", "Punjab board calendar", "Junior school calendar", "Winter campus calendar"][i],
      year: YEARS[i % 2],
      events: r.int(12, 40),
      campuses: r.int(1, 5),
      status: i === 3 ? "Draft" : "Published",
    })),
    form: [
      {
        title: "Template",
        fields: [
          { name: "name", label: "Name", required: true },
          { name: "year", label: "Academic year", type: "select", options: YEARS },
          { name: "description", label: "Description", type: "textarea", wide: true },
        ],
      },
    ],
    createLabel: "New template",
  },

  // ----- Setup ---------------------------------------------------------------
  {
    slug: "academic-years",
    title: "School years",
    singular: "School year",
    description: "A school year holds its terms, classes and sections.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "starts", label: "Starts", kind: "date" },
      { key: "ends", label: "Ends", kind: "date" },
      { key: "terms", label: "Terms", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(104, 3, (i) => ({
      name: YEARS[i],
      starts: `${2026 - i}-04-01`,
      ends: `${2027 - i}-03-31`,
      terms: 3,
      status: i === 0 ? "Current" : "Closed",
    })),
    form: [
      {
        title: "School year",
        fields: [
          { name: "name", label: "Name", required: true, placeholder: "2027/2028" },
          { name: "starts", label: "Starts on", type: "date", required: true },
          { name: "ends", label: "Ends on", type: "date", required: true },
          { name: "terms", label: "Number of terms", type: "select", options: ["2", "3", "4"] },
        ],
      },
    ],
    createLabel: "Add school year",
    related: [{ slug: "academic-cycle-sections", matchKey: "year", title: "Sections this year" }],
  },
  {
    slug: "academic-levels",
    title: "Classes",
    singular: "Class",
    description: "Classes are the levels learners move through, from Nursery to Class 10.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "stage", label: "Stage" },
      { key: "order", label: "Order", kind: "number" },
      { key: "sections", label: "Sections", kind: "number" },
      { key: "students", label: "Students", kind: "number" },
    ],
    rows: rows(105, CLASSES.length, (i, r) => ({
      name: CLASSES[i],
      stage: i < 2 ? "Early years" : i < 7 ? "Primary" : i < 10 ? "Middle" : "Secondary",
      order: i + 1,
      sections: i < 2 ? 1 : 2,
      students: r.int(40, 90),
    })),
    form: [
      {
        title: "Class",
        fields: [
          { name: "name", label: "Name", required: true, placeholder: "Class 6" },
          { name: "stage", label: "Stage", type: "select", options: ["Early years", "Primary", "Middle", "Secondary"] },
          { name: "order", label: "Order", type: "number" },
        ],
      },
    ],
    createLabel: "Add class",
    related: [{ slug: "academic-cycle-sections", matchKey: "level" }],
  },
  {
    slug: "academic-cycle-sections",
    title: "Sections",
    singular: "Section",
    description: "A section is a class group for one school year, with its own form teacher.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "level", label: "Class" },
      { key: "year", label: "School year" },
      { key: "teacher", label: "Form teacher" },
      { key: "students", label: "Students", kind: "number" },
      { key: "capacity", label: "Capacity", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(106, SECTIONS.length, (i, r) => ({
      name: SECTIONS[i],
      level: SECTIONS[i].replace(/ [A-C]$/, ""),
      year: YEARS[0],
      teacher: pickName(TEACHER_NAMES, i),
      students: r.int(22, 36),
      capacity: 40,
      status: "Active",
    })),
    form: [
      {
        title: "Section",
        fields: [
          { name: "name", label: "Name", required: true, placeholder: "Class 6 A" },
          { name: "level", label: "Class", type: "select", options: CLASSES },
          { name: "year", label: "School year", type: "select", options: YEARS },
          { name: "teacher", label: "Form teacher", type: "select", options: TEACHER_NAMES },
          { name: "capacity", label: "Capacity", type: "number", placeholder: "40" },
          { name: "room", label: "Room" },
        ],
      },
    ],
    createLabel: "Add section",
    related: [{ slug: "students", matchKey: "section" }],
  },

  // ----- People --------------------------------------------------------------
  {
    slug: "students",
    title: "Students",
    singular: "Student",
    description: "Add the first student record for this school.",
    titleKey: "name",
    view: "person",
    columns: [
      { key: "name", label: "Name", kind: "person", sub: "email" },
      { key: "admissionNumber", label: "Admission no.", kind: "mono" },
      { key: "section", label: "Section" },
      { key: "gender", label: "Gender" },
      { key: "guardian", label: "Guardian" },
      { key: "status", label: "Student record status", kind: "badge" },
      { key: "email", label: "Email", detailOnly: true },
      { key: "birthday", label: "Date of birth", kind: "date", detailOnly: true },
      { key: "admitted", label: "Admitted on", kind: "date", detailOnly: true },
      { key: "phone", label: "Phone", detailOnly: true },
      { key: "city", label: "City", detailOnly: true },
    ],
    rows: rows(107, STUDENT_NAMES.length, (i, r) => ({
      name: STUDENT_NAMES[i],
      email: emailFor(STUDENT_NAMES[i], "students.sps.edu.pk"),
      admissionNumber: `SPS/${2020 + (i % 7)}/${String(1001 + i)}`,
      section: SECTIONS[i % SECTIONS.length],
      gender: genderOf(STUDENT_NAMES[i]),
      guardian: pickName(PARENT_NAMES, i),
      status: i % 17 === 5 ? "Suspended" : i % 13 === 7 ? "Left" : "Active",
      birthday: shiftDate("2012-01-01", r.int(0, 3200)),
      admitted: shiftDate("2020-04-01", r.int(0, 2000)),
      phone: r.phone(),
      city: r.pick(["Rawalpindi", "Islamabad", "Wah Cantt"]),
    })),
    form: [
      personFields,
      {
        title: "Admission",
        fields: [
          { name: "section", label: "Section", type: "select", options: SECTIONS, required: true },
          { name: "admissionNumber", label: "Admission number", placeholder: "Made for you when left blank" },
          { name: "admitted", label: "Date of admission", type: "date" },
          { name: "guardian", label: "Parent / guardian", type: "select", options: PARENT_NAMES },
        ],
      },
    ],
    createLabel: "Add student",
    submitLabel: "Admit learner",
    related: [
      { slug: "fee-invoices", matchKey: "student", title: "Fee invoices" },
      { slug: "report-cards", matchKey: "student", title: "Report cards" },
    ],
  },
  {
    slug: "admissions-waitlist",
    title: "Admissions waitlist",
    singular: "Applicant",
    description: "Applicants waiting for a seat, in the order they applied.",
    titleKey: "name",
    columns: [
      { key: "position", label: "#", kind: "number" },
      { key: "name", label: "Applicant", kind: "person", sub: "guardian" },
      { key: "level", label: "Class applied for" },
      { key: "applied", label: "Applied", kind: "date" },
      { key: "guardian", label: "Guardian", detailOnly: true },
      { key: "phone", label: "Phone" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(108, 14, (i, r) => ({
      position: i + 1,
      name: pickName(STUDENT_NAMES, i + 20),
      guardian: pickName(PARENT_NAMES, i + 5),
      level: r.pick(CLASSES),
      applied: r.date(-120, -2),
      phone: r.phone(),
      status: r.pick(["Waiting", "Waiting", "Offered", "Interview", "Declined"]),
    })),
    form: [
      {
        title: "Applicant",
        fields: [
          { name: "name", label: "Applicant name", required: true },
          { name: "birthday", label: "Date of birth", type: "date" },
          { name: "level", label: "Class applied for", type: "select", options: CLASSES },
          { name: "guardian", label: "Guardian name" },
          { name: "phone", label: "Guardian phone", type: "tel" },
          { name: "email", label: "Guardian email", type: "email" },
          { name: "notes", label: "Notes", type: "textarea", wide: true },
        ],
      },
    ],
    createLabel: "Add applicant",
  },
  {
    slug: "data-sharing-requests",
    title: "Record sharing",
    singular: "Sharing request",
    description: "Requests to share a learner's records with another campus or school.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Learner", kind: "person" },
      { key: "to", label: "Shared with" },
      { key: "records", label: "Records" },
      { key: "requested", label: "Requested", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(109, 7, (i, r) => ({
      student: pickName(STUDENT_NAMES, i * 3),
      to: r.pick(["SPS Girls Campus", "SPS Cantt Campus", "Beaconhouse School", "City School"]),
      records: r.pick(["Academic record", "Health record", "Full profile"]),
      requested: r.date(-40, -1),
      status: r.pick(["Pending", "Approved", "Rejected"]),
    })),
    form: [
      {
        title: "Sharing request",
        fields: [
          { name: "student", label: "Learner", type: "select", options: STUDENT_NAMES },
          { name: "to", label: "Share with", required: true },
          { name: "records", label: "Records", type: "select", options: ["Academic record", "Health record", "Full profile"] },
          { name: "reason", label: "Reason", type: "textarea", wide: true },
        ],
      },
    ],
    createLabel: "Request sharing",
  },
  {
    slug: "campus-moves",
    title: "Campus moves",
    singular: "Campus move",
    description: "Learners moving between campuses of the organization.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Learner", kind: "person" },
      { key: "from", label: "From" },
      { key: "to", label: "To" },
      { key: "effective", label: "Effective on", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(110, 6, (i, r) => ({
      student: pickName(STUDENT_NAMES, i * 5 + 1),
      from: "Main Campus",
      to: r.pick(["Westridge", "Girls Campus", "Chaklala"]),
      effective: r.date(-20, 30),
      status: r.pick(["Pending", "Approved", "Completed"]),
    })),
    form: [
      {
        title: "Move",
        fields: [
          { name: "student", label: "Learner", type: "select", options: STUDENT_NAMES },
          { name: "to", label: "Move to campus", type: "select", options: ["Westridge", "Girls Campus", "Chaklala", "Cantt Campus"] },
          { name: "effective", label: "Effective on", type: "date" },
          { name: "reason", label: "Reason", type: "textarea", wide: true },
        ],
      },
    ],
    createLabel: "Request move",
  },
  {
    slug: "teachers",
    title: "Teachers",
    singular: "Teacher",
    description: "Add the teachers who take classes at this school.",
    titleKey: "name",
    view: "person",
    columns: [
      { key: "name", label: "Name", kind: "person", sub: "email" },
      { key: "subject", label: "Main subject" },
      { key: "sections", label: "Sections", kind: "number" },
      { key: "phone", label: "Phone" },
      { key: "joined", label: "Joined", kind: "date" },
      { key: "status", label: "Account status", kind: "badge" },
      { key: "email", label: "Email", detailOnly: true },
      { key: "qualification", label: "Qualification", detailOnly: true },
    ],
    rows: rows(111, TEACHER_NAMES.length, (i, r) => ({
      name: TEACHER_NAMES[i],
      email: emailFor(TEACHER_NAMES[i]),
      subject: SUBJECTS[i % SUBJECTS.length],
      sections: r.int(2, 6),
      phone: r.phone(),
      joined: shiftDate("2015-08-01", r.int(0, 3800)),
      status: i === 9 ? "Invited" : "Active",
      qualification: r.pick(["M.Sc.", "M.A.", "B.Ed.", "M.Phil.", "B.S."]),
    })),
    form: [personFields, { title: "Teaching", fields: [
      { name: "subject", label: "Main subject", type: "select", options: SUBJECTS },
      { name: "qualification", label: "Qualification" },
      { name: "joined", label: "Joined on", type: "date" },
    ] }],
    createLabel: "Add teacher",
    related: [{ slug: "course-offerings", matchKey: "teacher", title: "Subjects being taught" }],
  },
  {
    slug: "parents",
    title: "Parents",
    singular: "Parent",
    description: "Parents and guardians who can follow their children's progress.",
    titleKey: "name",
    view: "person",
    columns: [
      { key: "name", label: "Name", kind: "person", sub: "email" },
      { key: "phone", label: "Phone" },
      { key: "children", label: "Children", kind: "number" },
      { key: "relationship", label: "Relationship" },
      { key: "status", label: "Account status", kind: "badge" },
      { key: "email", label: "Email", detailOnly: true },
      { key: "occupation", label: "Occupation", detailOnly: true },
    ],
    rows: rows(112, PARENT_NAMES.length, (i, r) => ({
      name: PARENT_NAMES[i],
      email: emailFor(PARENT_NAMES[i], "gmail.com"),
      phone: r.phone(),
      children: r.int(1, 3),
      relationship: r.pick(["Father", "Mother", "Guardian"]),
      status: i % 8 === 3 ? "Invited" : "Active",
      occupation: r.pick(["Army officer", "Engineer", "Doctor", "Teacher", "Business owner", "Civil servant"]),
    })),
    form: [personFields, { title: "Family", fields: [
      { name: "relationship", label: "Relationship", type: "select", options: ["Father", "Mother", "Guardian"] },
      { name: "occupation", label: "Occupation" },
      { name: "children", label: "Link children", type: "select", options: STUDENT_NAMES, wide: true },
    ] }],
    createLabel: "Add parent",
    related: [{ slug: "students", matchKey: "guardian", title: "Children" }],
  },
  {
    slug: "cohorts",
    title: "Groups",
    singular: "Group",
    description: "Groups gather learners across sections — clubs, houses, sets and teams.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "kind", label: "Kind" },
      { key: "lead", label: "Lead" },
      { key: "members", label: "Members", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(113, 8, (i, r) => ({
      name: ["Debating club", "Science society", "Jinnah House", "Iqbal House", "Cricket team", "Maths set 1", "Quran recitation", "Robotics club"][i],
      kind: ["Club", "Club", "House", "House", "Team", "Set", "Club", "Club"][i],
      lead: pickName(TEACHER_NAMES, i + 3),
      members: r.int(12, 80),
      status: "Active",
    })),
    form: [{ title: "Group", fields: [
      { name: "name", label: "Name", required: true },
      { name: "kind", label: "Kind", type: "select", options: ["Club", "House", "Team", "Set"] },
      { name: "lead", label: "Lead teacher", type: "select", options: TEACHER_NAMES },
      { name: "description", label: "Description", type: "textarea", wide: true },
    ] }],
    createLabel: "Add group",
  },
  {
    slug: "graduation-plans",
    title: "Graduation plans",
    singular: "Graduation plan",
    description: "The rules a learner has to meet to graduate from a programme.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "program", label: "Programme" },
      { key: "rules", label: "Rules", kind: "number" },
      { key: "credits", label: "Credits needed", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(114, 4, (i) => ({
      name: ["Matriculation (Science)", "Matriculation (Computer)", "Middle school completion", "Primary school completion"][i],
      program: ["Matric Science", "Matric Computer", "Middle School", "Primary School"][i],
      rules: [6, 6, 4, 3][i],
      credits: [40, 40, 30, 20][i],
      status: i === 3 ? "Draft" : "Active",
    })),
    form: [{ title: "Plan", fields: [
      { name: "name", label: "Name", required: true },
      { name: "program", label: "Programme", type: "select", options: ["Matric Science", "Matric Computer", "Middle School", "Primary School"] },
      { name: "credits", label: "Credits needed", type: "number" },
      { name: "minimumAverage", label: "Minimum average %", type: "number" },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ] }],
    createLabel: "New plan",
  },
  {
    slug: "promotions",
    title: "Promotions",
    singular: "Promotion",
    description: "Moving learners from one section to the next at the end of a school year.",
    titleKey: "from",
    columns: [
      { key: "from", label: "From section" },
      { key: "to", label: "To section" },
      { key: "students", label: "Learners", kind: "number" },
      { key: "year", label: "Into year" },
      { key: "date", label: "Promoted on", kind: "date" },
      { key: "by", label: "By" },
    ],
    rows: rows(115, 8, (i, r) => ({
      from: SECTIONS[i],
      to: SECTIONS[i + 2],
      students: r.int(20, 34),
      year: YEARS[0],
      date: "2026-04-02",
      by: "Azeem Abbasi",
    })),
    form: [{ title: "Promote learners", fields: [
      { name: "from", label: "From section", type: "select", options: SECTIONS },
      { name: "to", label: "To section", type: "select", options: SECTIONS },
      { name: "year", label: "Into school year", type: "select", options: YEARS },
    ] }],
    createLabel: "Promote students",
    submitLabel: "Promote",
  },
  {
    slug: "graduations",
    title: "Graduations",
    singular: "Graduation",
    description: "Learners who completed a programme.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Learner", kind: "person" },
      { key: "program", label: "Programme" },
      { key: "average", label: "Final average", kind: "percent" },
      { key: "date", label: "Graduated", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(116, 10, (i, r) => ({
      student: pickName(STUDENT_NAMES, i + 30),
      program: r.pick(["Matric Science", "Matric Computer"]),
      average: r.int(58, 96),
      date: "2026-03-28",
      status: "Graduated",
    })),
    form: [{ title: "Graduate learners", fields: [
      { name: "section", label: "Section", type: "select", options: SECTIONS },
      { name: "plan", label: "Graduation plan", type: "select", options: ["Matriculation (Science)", "Matriculation (Computer)"] },
      { name: "date", label: "Graduation date", type: "date" },
    ] }],
    createLabel: "Graduate students",
    submitLabel: "Graduate",
  },
  {
    slug: "programs",
    title: "Programmes",
    singular: "Programme",
    description: "Programmes are the tracks learners follow, like Matric Science.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code", kind: "mono" },
      { key: "levels", label: "Classes" },
      { key: "students", label: "Learners", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(117, 5, (i, r) => ({
      name: ["Matric Science", "Matric Computer", "Middle School", "Primary School", "Early Years"][i],
      code: ["MS", "MC", "MID", "PRI", "EY"][i],
      levels: ["Class 9–10", "Class 9–10", "Class 6–8", "Class 1–5", "Nursery–Prep"][i],
      students: r.int(80, 400),
      status: "Active",
    })),
    form: [{ title: "Programme", fields: [
      { name: "name", label: "Name", required: true },
      { name: "code", label: "Code" },
      { name: "levels", label: "Classes", type: "select", options: CLASSES },
      { name: "description", label: "Description", type: "textarea", wide: true },
    ] }],
    createLabel: "Add programme",
  },
  {
    slug: "admins",
    title: "Administrators",
    singular: "Administrator",
    description: "People who manage the school's settings and records.",
    titleKey: "name",
    view: "person",
    columns: [
      { key: "name", label: "Name", kind: "person", sub: "email" },
      { key: "role", label: "Role" },
      { key: "lastSeen", label: "Last seen", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
      { key: "email", label: "Email", detailOnly: true },
    ],
    rows: rows(118, 5, (i, r) => ({
      name: ["Azeem Abbasi", "Adil Mehmood", "Sadia Raza", "Kamran Butt", "Nida Farooq"][i],
      email: ["admin", "adil", "sadia", "kamran", "nida"][i] + "@spsarmyschool.edu.pk",
      role: ["Super admin", "Admin", "Principal", "Accountant", "Librarian"][i],
      lastSeen: r.date(-6, 0),
      status: "Active",
    })),
    form: [personFields, { title: "Access", fields: [
      { name: "role", label: "Role", type: "select", options: ["Super admin", "Admin", "Principal", "Accountant", "Librarian"] },
    ] }],
    createLabel: "Add administrator",
  },
  {
    slug: "account-invitations",
    title: "Account invitations",
    singular: "Invitation",
    description: "Invitations waiting for someone to set up their account.",
    titleKey: "email",
    columns: [
      { key: "email", label: "Email" },
      { key: "name", label: "Name" },
      { key: "role", label: "Role" },
      { key: "sent", label: "Sent", kind: "date" },
      { key: "expires", label: "Expires", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(119, 8, (i, r) => {
      const name = pickName([...TEACHER_NAMES, ...PARENT_NAMES], i * 3);
      const sent = r.date(-14, -1);
      return {
        email: emailFor(name, "gmail.com"),
        name,
        role: r.pick(["Teacher", "Parent", "Student", "Accountant"]),
        sent,
        expires: shiftDate(sent, 7),
        status: r.pick(["Pending", "Pending", "Accepted", "Expired"]),
      };
    }),
    form: [{ title: "Invite someone", fields: [
      { name: "name", label: "Name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "role", label: "Role", type: "select", options: ["Teacher", "Parent", "Student", "Accountant", "Admin"] },
    ] }],
    createLabel: "Send invitation",
    submitLabel: "Send invitation",
  },

  // ----- Teaching ------------------------------------------------------------
  {
    slug: "subjects",
    title: "Subjects",
    singular: "Subject",
    description: "Subjects the school teaches across its classes.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "code", label: "Code", kind: "mono" },
      { key: "levels", label: "Classes" },
      { key: "teachers", label: "Teachers", kind: "number" },
      { key: "kind", label: "Kind" },
    ],
    rows: rows(120, SUBJECTS.length, (i, r) => ({
      name: SUBJECTS[i],
      code: SUBJECT_CODES[SUBJECTS[i]],
      levels: i >= 4 && i <= 6 ? "Class 9–10" : "Class 1–10",
      teachers: r.int(1, 5),
      kind: i >= 10 ? "Elective" : "Core",
    })),
    form: [{ title: "Subject", fields: [
      { name: "name", label: "Name", required: true },
      { name: "code", label: "Short code" },
      { name: "kind", label: "Kind", type: "select", options: ["Core", "Elective"] },
      { name: "levels", label: "Taught in", type: "select", options: CLASSES },
    ] }],
    createLabel: "Add subject",
    related: [{ slug: "course-offerings", matchKey: "subject" }],
  },
  {
    slug: "course-offerings",
    title: "Subjects being taught",
    singular: "Subject offering",
    description: "Which teacher takes which subject with which section this year.",
    titleKey: "title",
    columns: [
      { key: "title", label: "Offering" },
      { key: "subject", label: "Subject" },
      { key: "section", label: "Section" },
      { key: "teacher", label: "Teacher" },
      { key: "periods", label: "Periods / week", kind: "number" },
      { key: "learners", label: "Learners", kind: "number" },
    ],
    rows: rows(121, 24, (i, r) => {
      const subject = SUBJECTS[i % 8];
      const section = SECTIONS[i % SECTIONS.length];
      return {
        title: `${subject} · ${section}`,
        subject,
        section,
        teacher: pickName(TEACHER_NAMES, i % 8),
        periods: r.int(3, 7),
        learners: r.int(22, 36),
      };
    }),
    form: [{ title: "Offering", fields: [
      { name: "subject", label: "Subject", type: "select", options: SUBJECTS },
      { name: "section", label: "Section", type: "select", options: SECTIONS },
      { name: "teacher", label: "Teacher", type: "select", options: TEACHER_NAMES },
      { name: "periods", label: "Periods per week", type: "number" },
    ] }],
    createLabel: "Assign subject",
  },
  {
    slug: "syllabi",
    title: "Syllabi",
    singular: "Syllabus",
    description: "What each subject covers this year, topic by topic.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Syllabus" },
      { key: "subject", label: "Subject" },
      { key: "level", label: "Class" },
      { key: "topics", label: "Topics", kind: "number" },
      { key: "coverage", label: "Covered", kind: "percent" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(122, 14, (i, r) => {
      const subject = SUBJECTS[i % SUBJECTS.length];
      const level = CLASSES[2 + (i % 10)];
      return {
        name: `${subject} — ${level}`,
        subject,
        level,
        topics: r.int(8, 24),
        coverage: r.int(10, 85),
        status: r.pick(["Published", "Published", "Draft", "In review"]),
      };
    }),
    form: [{ title: "Syllabus", fields: [
      { name: "subject", label: "Subject", type: "select", options: SUBJECTS },
      { name: "level", label: "Class", type: "select", options: CLASSES },
      { name: "description", label: "Overview", type: "textarea", wide: true },
      { name: "file", label: "Attach a document", type: "file", wide: true },
    ] }],
    createLabel: "Add syllabus",
  },
  {
    slug: "timetables",
    title: "Timetables",
    singular: "Timetable",
    description: "Weekly lesson timetables for each section.",
    titleKey: "name",
    view: "timetable",
    columns: [
      { key: "name", label: "Name" },
      { key: "section", label: "Section" },
      { key: "term", label: "Term" },
      { key: "lessons", label: "Lessons / week", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(123, 10, (i, r) => ({
      name: `${SECTIONS[i]} timetable`,
      section: SECTIONS[i],
      term: TERMS[0],
      lessons: r.int(32, 40),
      status: i === 7 ? "Draft" : "Published",
    })),
    form: [{ title: "Timetable", fields: [
      { name: "name", label: "Name", required: true },
      { name: "section", label: "Section", type: "select", options: SECTIONS },
      { name: "term", label: "Term", type: "select", options: TERMS },
      { name: "description", label: "Description", type: "textarea", wide: true },
    ] }],
    createLabel: "Create timetable",
  },

  // ----- Assessment ----------------------------------------------------------
  {
    slug: "gradebooks",
    title: "Gradebooks",
    singular: "Gradebook",
    description: "Marks for each subject and section, assessment by assessment.",
    titleKey: "name",
    view: "marksheet",
    columns: [
      { key: "name", label: "Gradebook" },
      { key: "teacher", label: "Teacher" },
      { key: "assessments", label: "Assessments", kind: "number" },
      { key: "entered", label: "Marks entered", kind: "percent" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(124, 16, (i, r) => ({
      name: `${SUBJECTS[i % 8]} · ${SECTIONS[i % SECTIONS.length]}`,
      teacher: pickName(TEACHER_NAMES, i % 8),
      assessments: r.int(3, 6),
      entered: r.int(30, 100),
      status: r.pick(["Open", "Open", "Submitted", "Approved"]),
    })),
    form: [{ title: "Gradebook", fields: [
      { name: "offering", label: "Subject offering", type: "select", options: SUBJECTS },
      { name: "term", label: "Term", type: "select", options: TERMS },
    ] }],
    createLabel: "Set up gradebook",
  },
  {
    slug: "exams",
    title: "Exam schedules",
    singular: "Exam",
    description: "Exam papers, dates and rooms for the term.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Exam" },
      { key: "term", label: "Term" },
      { key: "starts", label: "Starts", kind: "date" },
      { key: "ends", label: "Ends", kind: "date" },
      { key: "papers", label: "Papers", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(125, 5, (i, r) => ({
      name: ["Mid-term examination", "Monthly test — October", "Monthly test — November", "Final examination", "Board pre-mocks"][i],
      term: TERMS[0],
      starts: ["2026-10-12", "2026-10-26", "2026-11-23", "2027-03-01", "2027-01-18"][i],
      ends: ["2026-10-22", "2026-10-28", "2026-11-25", "2027-03-14", "2027-01-28"][i],
      papers: r.int(6, 12),
      status: ["Completed", "Completed", "Scheduled", "Draft", "Scheduled"][i],
    })),
    form: [{ title: "Exam", fields: [
      { name: "name", label: "Name", required: true },
      { name: "term", label: "Term", type: "select", options: TERMS },
      { name: "starts", label: "Starts on", type: "date" },
      { name: "ends", label: "Ends on", type: "date" },
      { name: "weight", label: "Weight in final result (%)", type: "number" },
      { name: "description", label: "Description", type: "textarea", wide: true },
    ] }],
    createLabel: "Add exam",
  },
  {
    slug: "rankings",
    title: "Rankings",
    singular: "Ranking",
    description: "Learners ranked by average within their section.",
    titleKey: "student",
    columns: [
      { key: "position", label: "Position", kind: "number" },
      { key: "student", label: "Learner", kind: "person" },
      { key: "section", label: "Section" },
      { key: "average", label: "Average", kind: "percent" },
      { key: "grade", label: "Grade", kind: "badge" },
    ],
    rows: rows(126, 20, (i) => {
      const average = 97 - i * 2;
      return {
        position: i + 1,
        student: pickName(STUDENT_NAMES, i * 2),
        section: SECTIONS[8],
        average,
        grade: average >= 90 ? "A+" : average >= 80 ? "A" : average >= 70 ? "B" : "C",
      };
    }),
  },
  {
    slug: "grading-scales",
    title: "Grading scales",
    singular: "Grade band",
    description: "How percentages turn into grades and remarks.",
    titleKey: "grade",
    columns: [
      { key: "grade", label: "Grade", kind: "badge" },
      { key: "from", label: "From %", kind: "number" },
      { key: "to", label: "To %", kind: "number" },
      { key: "points", label: "Points", kind: "number" },
      { key: "remark", label: "Remark" },
    ],
    rows: rows(127, 6, (i) => ({
      grade: ["A+", "A", "B", "C", "D", "F"][i],
      from: [90, 80, 70, 60, 50, 0][i],
      to: [100, 89, 79, 69, 59, 49][i],
      points: [4, 3.7, 3, 2, 1, 0][i],
      remark: ["Outstanding", "Excellent", "Very good", "Good", "Satisfactory", "Needs improvement"][i],
    })),
    form: [{ title: "Grade band", fields: [
      { name: "grade", label: "Grade", required: true },
      { name: "from", label: "From %", type: "number" },
      { name: "to", label: "To %", type: "number" },
      { name: "points", label: "Points", type: "number" },
      { name: "remark", label: "Remark", wide: true },
    ] }],
    createLabel: "Add grade band",
  },
  {
    slug: "report-cards",
    title: "Report cards",
    singular: "Report card",
    description: "Term report cards, ready to publish to families.",
    titleKey: "student",
    view: "report-card",
    columns: [
      { key: "student", label: "Learner", kind: "person", sub: "section" },
      { key: "section", label: "Section", detailOnly: true },
      { key: "year", label: "Academic year" },
      { key: "term", label: "Term" },
      { key: "average", label: "Average", kind: "percent" },
      { key: "position", label: "Position", kind: "number" },
      { key: "status", label: "Published", kind: "badge" },
    ],
    rows: rows(128, STUDENT_NAMES.length, (i, r) => ({
      student: STUDENT_NAMES[i],
      section: SECTIONS[i % SECTIONS.length],
      year: YEARS[0],
      term: TERMS[0],
      average: r.int(52, 97),
      position: r.int(1, 30),
      status: i % 5 === 0 ? "Draft" : "Published",
    })),
  },
  {
    slug: "transcripts",
    title: "Transcripts",
    singular: "Transcript",
    description: "A learner's full record across every year at the school.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Learner", kind: "person" },
      { key: "admissionNumber", label: "Admission no.", kind: "mono" },
      { key: "years", label: "Years", kind: "number" },
      { key: "cgpa", label: "Cumulative average", kind: "percent" },
      { key: "issued", label: "Last issued", kind: "date" },
    ],
    rows: rows(129, 16, (i, r) => ({
      student: STUDENT_NAMES[i],
      admissionNumber: `SPS/${2020 + (i % 7)}/${String(1001 + i)}`,
      years: r.int(2, 7),
      cgpa: r.int(55, 95),
      issued: r.date(-300, -5),
    })),
  },

  // ----- Operations ----------------------------------------------------------
  {
    slug: "portal-requests",
    title: "Family requests",
    singular: "Family request",
    description: "Requests families send through the parent portal.",
    titleKey: "subject",
    columns: [
      { key: "subject", label: "Request" },
      { key: "from", label: "From", kind: "person" },
      { key: "student", label: "About" },
      { key: "kind", label: "Kind" },
      { key: "received", label: "Received", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(130, 12, (i, r) => ({
      subject: r.pick(["Leave for family wedding", "Update home address", "Request a meeting with class teacher", "Fee instalment plan", "Bus route change", "Copy of report card"]),
      from: pickName(PARENT_NAMES, i),
      student: pickName(STUDENT_NAMES, i),
      kind: r.pick(["Leave", "Records", "Meeting", "Finance", "Transport"]),
      received: r.date(-20, 0),
      status: r.pick(["Open", "Open", "In progress", "Resolved"]),
    })),
  },
  {
    slug: "calendar-events",
    title: "Calendar",
    singular: "Event",
    description: "Holidays, exams and events on the school calendar.",
    titleKey: "title",
    columns: [
      { key: "title", label: "What is on" },
      { key: "date", label: "Day", kind: "date" },
      { key: "time", label: "Time" },
      { key: "kind", label: "Kind", kind: "badge" },
      { key: "audience", label: "Who it is for" },
      { key: "location", label: "Location", detailOnly: true },
    ],
    rows: rows(131, 18, (i, r) => ({
      title: ["Iqbal Day holiday", "Parent–teacher meeting", "Science fair", "Monthly test begins", "Sports day", "Quaid Day holiday", "Winter break begins", "Inter-house debate", "Annual prize distribution", "Staff training day", "Board registration deadline", "Art exhibition", "Field trip — Lok Virsa", "Fire drill", "Spelling bee finals", "Classes resume", "Kashmir Day holiday", "Pakistan Day assembly"][i],
      date: shiftDate(DEMO_TODAY, [4, 8, 12, 18, 22, 50, 46, 15, 30, 9, 26, 33, 2, 1, 6, 76, 92, 140][i]),
      time: r.pick(["All day", "08:00", "09:30", "11:00", "13:30"]),
      kind: r.pick(["Holiday", "Event", "Exam", "Meeting"]),
      audience: r.pick(["Everyone", "Students", "Parents", "Staff", "Class 9–10"]),
      location: r.pick(["Main hall", "Sports ground", "Auditorium", "Classrooms", "—"]),
    })).sort((a, b) => String(a.date).localeCompare(String(b.date))),
    form: [{ title: "Event", fields: [
      { name: "title", label: "Title", required: true },
      { name: "kind", label: "Kind of day", type: "select", options: ["Holiday", "Event", "Exam", "Meeting"] },
      { name: "date", label: "Day", type: "date", required: true },
      { name: "time", label: "Starts at", type: "time" },
      { name: "audience", label: "Who it is for", type: "select", options: ["Everyone", "Students", "Parents", "Staff"] },
      { name: "location", label: "Location" },
      { name: "description", label: "Details", type: "textarea", wide: true },
    ] }],
    createLabel: "Add event",
  },
  {
    slug: "notices",
    title: "Notices",
    singular: "Notice",
    description: "Announcements for students, parents and staff.",
    titleKey: "title",
    columns: [
      { key: "title", label: "Title" },
      { key: "audience", label: "Audience" },
      { key: "starts", label: "Shows from", kind: "date" },
      { key: "ends", label: "Until", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
      { key: "body", label: "Notice", detailOnly: true },
    ],
    rows: rows(132, 9, (i, r) => ({
      title: ["Winter uniform from 15 November", "Fee deadline extended", "Mid-term results published", "Polio vaccination drive", "Annual sports week", "New library timings", "Parent–teacher meeting schedule", "Smog advisory — outdoor activities paused", "Admissions open for 2027/2028"][i],
      audience: r.pick(["Everyone", "Parents", "Students", "Staff"]),
      starts: r.date(-15, 0),
      ends: r.date(5, 30),
      status: i === 8 ? "Draft" : "Published",
      body: "Dear parents and students, please read this notice carefully. Further details are available from the school office during working hours.",
    })),
    form: [{ title: "Notice", fields: [
      { name: "title", label: "Title", required: true, wide: true },
      { name: "audience", label: "Audience", type: "select", options: ["Everyone", "Parents", "Students", "Staff"] },
      { name: "starts", label: "Shows from", type: "date" },
      { name: "ends", label: "Until", type: "date" },
      { name: "email", label: "Also send by email", type: "checkbox" },
      { name: "body", label: "Notice", type: "textarea", wide: true, required: true },
      { name: "attachment", label: "Attachment", type: "file", wide: true },
    ] }],
    createLabel: "Add notice",
    submitLabel: "Publish notice",
  },
  {
    slug: "incidents",
    title: "Cases",
    singular: "Case",
    description: "Behaviour, safeguarding and wellbeing cases, handled in confidence.",
    titleKey: "title",
    columns: [
      { key: "title", label: "Case" },
      { key: "student", label: "Learner", kind: "person" },
      { key: "kind", label: "Kind" },
      { key: "severity", label: "Severity", kind: "badge" },
      { key: "opened", label: "Opened", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
      { key: "owner", label: "Handled by", detailOnly: true },
    ],
    rows: rows(133, 9, (i, r) => ({
      title: r.pick(["Late to class repeatedly", "Bullying report", "Damage to school property", "Fight during break", "Mobile phone in exam", "Unexplained absence"]),
      student: pickName(STUDENT_NAMES, i * 4 + 2),
      kind: r.pick(["Behaviour", "Safeguarding", "Attendance", "Academic"]),
      severity: r.pick(["Low", "Medium", "High"]),
      opened: r.date(-60, -1),
      status: r.pick(["Open", "Investigating", "Closed"]),
      owner: pickName(TEACHER_NAMES, i),
    })),
    form: [{ title: "Case", fields: [
      { name: "title", label: "What happened", required: true, wide: true },
      { name: "student", label: "Learner", type: "select", options: STUDENT_NAMES },
      { name: "kind", label: "Kind", type: "select", options: ["Behaviour", "Safeguarding", "Attendance", "Academic"] },
      { name: "severity", label: "Severity", type: "select", options: ["Low", "Medium", "High"] },
      { name: "opened", label: "Happened on", type: "date" },
      { name: "details", label: "Details", type: "textarea", wide: true },
    ] }],
    createLabel: "Open a case",
  },
  {
    slug: "support-plans",
    title: "Support plans",
    singular: "Support plan",
    description: "Plans for learners who need extra help, with goals and reviews.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Learner", kind: "person" },
      { key: "need", label: "Need" },
      { key: "coordinator", label: "Coordinator" },
      { key: "review", label: "Next review", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(134, 7, (i, r) => ({
      student: pickName(STUDENT_NAMES, i * 6 + 1),
      need: r.pick(["Reading support", "Dyslexia", "Speech therapy", "Maths catch-up", "Emotional wellbeing"]),
      coordinator: pickName(TEACHER_NAMES, i + 2),
      review: r.date(3, 60),
      status: r.pick(["Active", "Active", "Under review", "Closed"]),
    })),
    form: [{ title: "Support plan", fields: [
      { name: "student", label: "Learner", type: "select", options: STUDENT_NAMES },
      { name: "need", label: "Need", required: true },
      { name: "coordinator", label: "Coordinator", type: "select", options: TEACHER_NAMES },
      { name: "review", label: "Next review", type: "date" },
      { name: "goals", label: "Goals", type: "textarea", wide: true },
    ] }],
    createLabel: "New support plan",
  },
  {
    slug: "health-records",
    title: "Health records",
    singular: "Health record",
    description: "Allergies, conditions and emergency contacts. Visible only to permitted staff.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Learner", kind: "person" },
      { key: "bloodGroup", label: "Blood group", kind: "mono" },
      { key: "allergies", label: "Allergies" },
      { key: "conditions", label: "Conditions" },
      { key: "emergency", label: "Emergency contact" },
      { key: "updated", label: "Updated", kind: "date" },
    ],
    rows: rows(135, 18, (i, r) => ({
      student: STUDENT_NAMES[i],
      bloodGroup: r.pick(["A+", "B+", "O+", "AB+", "A-", "O-"]),
      allergies: r.pick(["None", "None", "Peanuts", "Dust", "Penicillin"]),
      conditions: r.pick(["None", "None", "None", "Asthma", "Diabetes (Type 1)"]),
      emergency: r.phone(),
      updated: r.date(-200, -1),
    })),
    form: [{ title: "Health record", fields: [
      { name: "student", label: "Learner", type: "select", options: STUDENT_NAMES },
      { name: "bloodGroup", label: "Blood group", type: "select", options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] },
      { name: "allergies", label: "Allergies" },
      { name: "conditions", label: "Medical conditions" },
      { name: "emergency", label: "Emergency contact", type: "tel" },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ] }],
    createLabel: "Add health record",
  },
  {
    slug: "staff-profiles",
    title: "Staff directory",
    singular: "Staff member",
    description: "Everyone who works at the school, teaching and non-teaching.",
    titleKey: "name",
    view: "person",
    columns: [
      { key: "name", label: "Name", kind: "person", sub: "designation" },
      { key: "designation", label: "Designation", detailOnly: true },
      { key: "department", label: "Department" },
      { key: "employeeNo", label: "Employee no.", kind: "mono" },
      { key: "phone", label: "Phone" },
      { key: "joined", label: "Joined", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(136, STAFF_NAMES.length + 6, (i, r) => {
      const name = i < STAFF_NAMES.length ? STAFF_NAMES[i] : TEACHER_NAMES[i];
      return {
        name,
        designation: i < STAFF_NAMES.length ? r.pick(["Accountant", "Clerk", "Librarian", "Lab assistant", "Driver", "Nurse", "IT officer"]) : "Teacher",
        department: i < STAFF_NAMES.length ? r.pick(["Administration", "Finance", "Library", "Transport", "Health", "IT"]) : "Academics",
        employeeNo: `EMP-${String(200 + i)}`,
        phone: r.phone(),
        joined: shiftDate("2014-01-01", r.int(0, 4000)),
        status: i === 4 ? "On leave" : "Active",
      };
    }),
    form: [personFields, { title: "Employment", fields: [
      { name: "designation", label: "Designation" },
      { name: "department", label: "Department", type: "select", options: ["Academics", "Administration", "Finance", "Library", "Transport", "Health", "IT"] },
      { name: "employeeNo", label: "Employee number" },
      { name: "joined", label: "Joined on", type: "date" },
    ] }],
    createLabel: "Add staff member",
  },
  {
    slug: "staff-leave",
    title: "Staff leave",
    singular: "Leave request",
    description: "Leave requests from staff, with cover arrangements.",
    titleKey: "staff",
    columns: [
      { key: "staff", label: "Staff member", kind: "person" },
      { key: "kind", label: "Kind" },
      { key: "from", label: "From", kind: "date" },
      { key: "to", label: "To", kind: "date" },
      { key: "days", label: "Days", kind: "number" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(137, 10, (i, r) => {
      const from = r.date(-20, 25);
      const days = r.int(1, 5);
      return {
        staff: pickName([...TEACHER_NAMES, ...STAFF_NAMES], i * 2),
        kind: r.pick(["Casual", "Sick", "Annual", "Maternity", "Study"]),
        from,
        to: shiftDate(from, days - 1),
        days,
        status: r.pick(["Pending", "Approved", "Approved", "Rejected"]),
      };
    }),
    form: [{ title: "Leave request", fields: [
      { name: "staff", label: "Staff member", type: "select", options: [...TEACHER_NAMES, ...STAFF_NAMES] },
      { name: "kind", label: "Kind of leave", type: "select", options: ["Casual", "Sick", "Annual", "Maternity", "Study"] },
      { name: "from", label: "From", type: "date" },
      { name: "to", label: "To", type: "date" },
      { name: "reason", label: "Reason", type: "textarea", wide: true },
    ] }],
    createLabel: "Request leave",
  },

  // ----- Finance -------------------------------------------------------------
  {
    slug: "fee-invoices",
    title: "Fee invoices",
    singular: "Fee invoice",
    description: "Bills sent to families and what has been paid against them.",
    titleKey: "number",
    view: "invoice",
    columns: [
      { key: "number", label: "Invoice", kind: "mono" },
      { key: "student", label: "Learner", kind: "person", sub: "section" },
      { key: "section", label: "Section", detailOnly: true },
      { key: "issued", label: "Issued", kind: "date" },
      { key: "due", label: "Due", kind: "date" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "paid", label: "Paid", kind: "money" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(138, 40, (i, r) => {
      const amount = r.money(18000, 42000, 1000);
      const status = r.pick(["Paid", "Paid", "Partially paid", "Unpaid", "Overdue"]);
      const paid = status === "Paid" ? amount : status === "Partially paid" ? Math.round(amount / 2000) * 1000 : 0;
      return {
        number: `INV-2026-${String(1200 + i)}`,
        student: STUDENT_NAMES[i % STUDENT_NAMES.length],
        section: SECTIONS[i % SECTIONS.length],
        issued: r.date(-70, -10),
        due: r.date(-20, 20),
        amount,
        paid,
        status,
      };
    }),
    form: [{ title: "Invoice", fields: [
      { name: "student", label: "Learner", type: "select", options: STUDENT_NAMES, required: true },
      { name: "issued", label: "Issue date", type: "date" },
      { name: "due", label: "Due date", type: "date" },
      { name: "fee", label: "Fee", type: "select", options: ["Tuition fee", "Admission fee", "Exam fee", "Transport fee", "Lab fee"] },
      { name: "amount", label: "Amount (Rs)", type: "number" },
      { name: "note", label: "Note to family", type: "textarea", wide: true },
    ] }],
    createLabel: "Create invoice",
  },
  {
    slug: "fee-categories",
    title: "Fee categories",
    singular: "Fee category",
    description: "Groups of fees, like tuition or transport.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "fees", label: "Fees", kind: "number" },
      { key: "description", label: "Description" },
    ],
    rows: rows(139, 5, (i, r) => ({
      name: ["Tuition", "Admission", "Examinations", "Transport", "Activities"][i],
      fees: r.int(1, 6),
      description: ["Monthly tuition by class", "One-time admission charges", "Term exam fees", "Bus routes", "Clubs, trips and sports"][i],
    })),
    form: [{ title: "Fee category", fields: [
      { name: "name", label: "Name", required: true },
      { name: "description", label: "Description", type: "textarea", wide: true },
    ] }],
    createLabel: "Add fee category",
    related: [{ slug: "fees", matchKey: "category" }],
  },
  {
    slug: "fees",
    title: "Fees",
    singular: "Fee",
    description: "The individual charges families are billed.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "category", label: "Category" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "frequency", label: "Billed" },
      { key: "applies", label: "Applies to" },
    ],
    rows: rows(140, 10, (i) => ({
      name: ["Tuition — Primary", "Tuition — Middle", "Tuition — Secondary", "Admission fee", "Security deposit", "Mid-term exam fee", "Final exam fee", "Bus — Route A", "Bus — Route B", "Sports & clubs"][i],
      category: ["Tuition", "Tuition", "Tuition", "Admission", "Admission", "Examinations", "Examinations", "Transport", "Transport", "Activities"][i],
      amount: [14000, 17000, 21000, 25000, 10000, 2500, 3000, 6500, 7500, 2000][i],
      frequency: ["Monthly", "Monthly", "Monthly", "Once", "Once", "Per term", "Per term", "Monthly", "Monthly", "Per term"][i],
      applies: ["Class 1–5", "Class 6–8", "Class 9–10", "New learners", "New learners", "All classes", "All classes", "Route A riders", "Route B riders", "All classes"][i],
    })),
    form: [{ title: "Fee", fields: [
      { name: "name", label: "Name", required: true },
      { name: "category", label: "Category", type: "select", options: ["Tuition", "Admission", "Examinations", "Transport", "Activities"] },
      { name: "amount", label: "Amount (Rs)", type: "number" },
      { name: "frequency", label: "Billed", type: "select", options: ["Monthly", "Per term", "Yearly", "Once"] },
      { name: "applies", label: "Applies to", type: "select", options: CLASSES },
    ] }],
    createLabel: "Add fee",
  },
  {
    slug: "budgets",
    title: "Budgets",
    singular: "Budget line",
    description: "What each account plans to spend this financial year, and what it has spent.",
    titleKey: "account",
    columns: [
      { key: "account", label: "Account" },
      { key: "cycle", label: "Cycle" },
      { key: "planned", label: "Planned", kind: "money" },
      { key: "spent", label: "Spent", kind: "money" },
      { key: "used", label: "Used", kind: "percent" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(141, 8, (i, r) => {
      const planned = r.money(400000, 3000000, 50000);
      const used = r.int(15, 105);
      return {
        account: ["Salaries", "Utilities", "Library books", "Science labs", "Sports equipment", "Building maintenance", "IT & computers", "Events"][i],
        cycle: "FY 2026/2027",
        planned,
        spent: Math.round((planned * used) / 100 / 1000) * 1000,
        used,
        status: used > 100 ? "Over budget" : used > 85 ? "Near limit" : "On track",
      };
    }),
    form: [{ title: "Write or revise a plan", fields: [
      { name: "account", label: "Account", type: "select", options: ["Salaries", "Utilities", "Library books", "Science labs", "Sports equipment", "Building maintenance", "IT & computers", "Events"] },
      { name: "planned", label: "Amount (Rs)", type: "number" },
      { name: "cycle", label: "Covers", type: "select", options: ["FY 2026/2027", "FY 2027/2028"] },
      { name: "program", label: "Programme (optional)" },
      { name: "note", label: "Note (optional)", type: "textarea", wide: true },
    ] }],
    createLabel: "Plan a budget",
  },
  {
    slug: "expenses",
    title: "Expenses",
    singular: "Expense",
    description: "Money the school has spent, by account.",
    titleKey: "description",
    columns: [
      { key: "description", label: "Description" },
      { key: "account", label: "Account" },
      { key: "date", label: "Date", kind: "date" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "payee", label: "Paid to" },
    ],
    rows: rows(142, 14, (i, r) => ({
      description: r.pick(["Electricity bill", "Lab chemicals", "Printer toner", "Sports kits", "Generator fuel", "Plumbing repairs", "Library books order", "Internet bill"]),
      account: r.pick(["Utilities", "Science labs", "IT & computers", "Sports equipment", "Building maintenance", "Library books"]),
      date: r.date(-60, 0),
      amount: r.money(5000, 180000, 500),
      payee: r.pick(["IESCO", "Al-Noor Traders", "PTCL", "City Stationers", "Rawal Supplies"]),
    })),
    form: [{ title: "Record an expense", fields: [
      { name: "description", label: "Description", required: true, wide: true },
      { name: "account", label: "Account", type: "select", options: ["Utilities", "Science labs", "IT & computers", "Sports equipment", "Building maintenance", "Library books"] },
      { name: "date", label: "Date", type: "date" },
      { name: "amount", label: "Amount (Rs)", type: "number" },
      { name: "payee", label: "Paid to" },
      { name: "receipt", label: "Receipt", type: "file" },
    ] }],
    createLabel: "Record expense",
  },
  {
    slug: "cash-deposits",
    title: "Cash deposits",
    singular: "Cash deposit",
    description: "Cash taken at the counter and banked.",
    titleKey: "reference",
    columns: [
      { key: "reference", label: "Reference", kind: "mono" },
      { key: "date", label: "Deposited", kind: "date" },
      { key: "bank", label: "Bank" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "by", label: "Deposited by" },
    ],
    rows: rows(143, 8, (i, r) => ({
      reference: `DEP-${String(5400 + i)}`,
      date: r.date(-40, 0),
      bank: r.pick(["HBL — Saddar", "Askari Bank — Cantt", "Meezan Bank — Mall Road"]),
      amount: r.money(80000, 650000, 1000),
      by: "Kamran Butt",
    })),
    form: [{ title: "Record a cash deposit", fields: [
      { name: "date", label: "Deposited on", type: "date" },
      { name: "bank", label: "Bank", type: "select", options: ["HBL — Saddar", "Askari Bank — Cantt", "Meezan Bank — Mall Road"] },
      { name: "amount", label: "Amount (Rs)", type: "number" },
      { name: "slip", label: "Deposit slip", type: "file" },
    ] }],
    createLabel: "Record deposit",
  },

  // ----- Boarding, facilities, library --------------------------------------
  {
    slug: "dormitories",
    title: "Houses",
    singular: "House",
    description: "Boarding houses, their rooms and the learners who live in them.",
    titleKey: "name",
    columns: [
      { key: "name", label: "House" },
      { key: "warden", label: "Warden" },
      { key: "rooms", label: "Rooms", kind: "number" },
      { key: "boarders", label: "Boarders", kind: "number" },
      { key: "capacity", label: "Capacity", kind: "number" },
    ],
    rows: rows(144, 4, (i, r) => ({
      name: ["Jinnah House", "Iqbal House", "Fatima House", "Liaquat House"][i],
      warden: pickName(TEACHER_NAMES, i + 6),
      rooms: r.int(12, 24),
      boarders: r.int(40, 80),
      capacity: 96,
    })),
    form: [{ title: "House", fields: [
      { name: "name", label: "Name", required: true },
      { name: "warden", label: "Warden", type: "select", options: TEACHER_NAMES },
      { name: "rooms", label: "Rooms", type: "number" },
      { name: "capacity", label: "Beds", type: "number" },
    ] }],
    createLabel: "Add house",
  },
  {
    slug: "overnight-leaves",
    title: "Nights away",
    singular: "Night away",
    description: "Boarders signed out overnight and when they are due back.",
    titleKey: "student",
    columns: [
      { key: "student", label: "Boarder", kind: "person" },
      { key: "house", label: "House" },
      { key: "leaves", label: "Leaves", kind: "date" },
      { key: "returns", label: "Returns", kind: "date" },
      { key: "with", label: "Collected by" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(145, 8, (i, r) => {
      const leaves = r.date(-5, 5);
      return {
        student: pickName(STUDENT_NAMES, i * 3 + 1),
        house: r.pick(["Jinnah House", "Iqbal House", "Fatima House"]),
        leaves,
        returns: shiftDate(leaves, r.int(1, 3)),
        with: pickName(PARENT_NAMES, i),
        status: r.pick(["Approved", "Away", "Returned", "Pending"]),
      };
    }),
    form: [{ title: "Sign out a boarder", fields: [
      { name: "student", label: "Boarder", type: "select", options: STUDENT_NAMES },
      { name: "leaves", label: "Leaves on", type: "date" },
      { name: "returns", label: "Returns on", type: "date" },
      { name: "with", label: "Collected by" },
      { name: "reason", label: "Reason", type: "textarea", wide: true },
    ] }],
    createLabel: "Sign out boarder",
  },
  {
    slug: "facilities",
    title: "Facilities",
    singular: "Facility",
    description: "Rooms, labs and spaces that can be booked or timetabled.",
    titleKey: "name",
    columns: [
      { key: "name", label: "Name" },
      { key: "kind", label: "Kind" },
      { key: "capacity", label: "Capacity", kind: "number" },
      { key: "building", label: "Building" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(146, 10, (i, r) => ({
      name: ["Physics lab", "Chemistry lab", "Biology lab", "Computer lab 1", "Computer lab 2", "Main hall", "Library", "Auditorium", "Sports ground", "Art room"][i],
      kind: ["Lab", "Lab", "Lab", "Lab", "Lab", "Hall", "Library", "Hall", "Outdoor", "Classroom"][i],
      capacity: r.int(30, 300),
      building: r.pick(["Block A", "Block B", "Senior wing", "Junior wing"]),
      status: i === 4 ? "Under maintenance" : "Available",
    })),
    form: [{ title: "Facility", fields: [
      { name: "name", label: "Name", required: true },
      { name: "kind", label: "Kind", type: "select", options: ["Lab", "Hall", "Library", "Outdoor", "Classroom"] },
      { name: "capacity", label: "Capacity", type: "number" },
      { name: "building", label: "Building" },
    ] }],
    createLabel: "Add facility",
  },
  {
    slug: "library-copies",
    title: "Catalogue",
    singular: "Book",
    description: "Every book in the library, and how many copies are on the shelf.",
    titleKey: "title",
    columns: [
      { key: "title", label: "Title", kind: "person", sub: "author" },
      { key: "author", label: "Author", detailOnly: true },
      { key: "isbn", label: "ISBN", kind: "mono" },
      { key: "shelf", label: "Shelf", kind: "mono" },
      { key: "copies", label: "Copies", kind: "number" },
      { key: "available", label: "Available", kind: "number" },
    ],
    rows: rows(147, 16, (i, r) => {
      const copies = r.int(1, 8);
      return {
        title: ["Oxford Primary Maths 4", "The Secret Garden", "Physics for Class 9", "A Brief History of Time", "Bang-e-Dra", "Pakistan: A Personal History", "Charlotte's Web", "Computer Science 10", "The Alchemist", "Chemistry Class 10", "Wings of Fire", "Matilda", "Urdu Qawaid", "Islamic History", "Tom Sawyer", "Biology Class 9"][i],
        author: ["Oxford", "F. H. Burnett", "PTB", "Stephen Hawking", "Allama Iqbal", "Imran Khan", "E. B. White", "PTB", "Paulo Coelho", "PTB", "A. P. J. Abdul Kalam", "Roald Dahl", "Maulvi Abdul Haq", "Various", "Mark Twain", "PTB"][i],
        isbn: `978-${r.int(100, 999)}-${r.int(10000, 99999)}-${r.int(0, 9)}`,
        shelf: `${r.pick(["A", "B", "C", "D"])}-${r.int(1, 12)}`,
        copies,
        available: r.int(0, copies),
      };
    }),
    form: [{ title: "Book", fields: [
      { name: "title", label: "Title", required: true, wide: true },
      { name: "author", label: "Author" },
      { name: "isbn", label: "ISBN" },
      { name: "shelf", label: "Shelf" },
      { name: "copies", label: "Copies", type: "number" },
    ] }],
    createLabel: "Add book",
    related: [{ slug: "library-loans", matchKey: "book", title: "Loans" }],
  },
  {
    slug: "library-loans",
    title: "Lending desk",
    singular: "Loan",
    description: "Books out on loan and when they are due back.",
    titleKey: "book",
    columns: [
      { key: "book", label: "Book" },
      { key: "borrower", label: "Borrower", kind: "person" },
      { key: "out", label: "Lent", kind: "date" },
      { key: "due", label: "Due", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(148, 12, (i, r) => {
      const out = r.date(-25, -1);
      const due = shiftDate(out, 14);
      return {
        book: r.pick(["The Secret Garden", "Physics for Class 9", "Bang-e-Dra", "Matilda", "The Alchemist", "Wings of Fire"]),
        borrower: pickName(STUDENT_NAMES, i * 2 + 3),
        out,
        due,
        status: due < DEMO_TODAY ? "Overdue" : r.pick(["On loan", "On loan", "Returned"]),
      };
    }),
    form: [{ title: "Lend a book", fields: [
      { name: "book", label: "Book", type: "select", options: ["The Secret Garden", "Physics for Class 9", "Bang-e-Dra", "Matilda", "The Alchemist", "Wings of Fire"] },
      { name: "borrower", label: "Borrower", type: "select", options: STUDENT_NAMES },
      { name: "due", label: "Due back", type: "date" },
    ] }],
    createLabel: "Lend a book",
    submitLabel: "Lend",
  },
  {
    slug: "library-reservations",
    title: "Library queue",
    singular: "Reservation",
    description: "Readers waiting for a copy to come back.",
    titleKey: "book",
    columns: [
      { key: "position", label: "#", kind: "number" },
      { key: "book", label: "Book" },
      { key: "reader", label: "Reader", kind: "person" },
      { key: "placed", label: "Placed", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(149, 6, (i, r) => ({
      position: i + 1,
      book: r.pick(["Matilda", "Wings of Fire", "The Alchemist", "A Brief History of Time"]),
      reader: pickName(STUDENT_NAMES, i * 5),
      placed: r.date(-10, 0),
      status: i === 0 ? "Ready to collect" : "Waiting",
    })),
    form: [{ title: "Reserve a book", fields: [
      { name: "book", label: "Book", type: "select", options: ["Matilda", "Wings of Fire", "The Alchemist", "A Brief History of Time"] },
      { name: "reader", label: "Reader", type: "select", options: STUDENT_NAMES },
    ] }],
    createLabel: "Reserve a book",
  },

  // ----- Admin ---------------------------------------------------------------
  {
    slug: "imports",
    title: "Imports",
    singular: "Import",
    description: "Bring students, teachers and parents in from a spreadsheet.",
    titleKey: "file",
    columns: [
      { key: "file", label: "File", kind: "mono" },
      { key: "kind", label: "Importing" },
      { key: "rowsTotal", label: "Rows", kind: "number" },
      { key: "imported", label: "Imported", kind: "number" },
      { key: "failed", label: "Failed", kind: "number" },
      { key: "uploaded", label: "Uploaded", kind: "date" },
      { key: "status", label: "Status", kind: "badge" },
    ],
    rows: rows(150, 6, (i, r) => {
      const total = r.int(30, 400);
      const failed = r.int(0, 8);
      return {
        file: ["students-class-6.csv", "teachers-2026.xlsx", "parents.csv", "students-class-9.csv", "staff.xlsx", "students-nursery.csv"][i],
        kind: ["Students", "Teachers", "Parents", "Students", "Staff", "Students"][i],
        rowsTotal: total,
        imported: total - failed,
        failed,
        uploaded: r.date(-90, -1),
        status: failed > 5 ? "Needs review" : "Completed",
      };
    }),
    form: [{ title: "Upload a file", description: "CSV or Excel, with one person per row. Download a template to see the columns.", fields: [
      { name: "kind", label: "Importing", type: "select", options: ["Students", "Teachers", "Parents", "Staff"] },
      { name: "file", label: "File", type: "file", required: true },
      { name: "section", label: "Place students in section", type: "select", options: SECTIONS },
      { name: "invite", label: "Email invitations when done", type: "checkbox" },
    ] }],
    createLabel: "Import a file",
    submitLabel: "Upload and check",
  },
  {
    slug: "roles",
    title: "Roles",
    singular: "Role",
    description: "Roles decide what each person can see and do.",
    titleKey: "name",
    view: "permissions",
    columns: [
      { key: "name", label: "Role" },
      { key: "people", label: "People", kind: "number" },
      { key: "permissions", label: "Permissions", kind: "number" },
      { key: "kind", label: "Kind", kind: "badge" },
    ],
    rows: rows(151, 9, (i, r) => ({
      name: ["Super admin", "Admin", "Principal", "Teacher", "Student", "Parent", "Accountant", "Librarian", "Nurse"][i],
      people: [1, 2, 1, 16, 48, 30, 2, 1, 1][i],
      permissions: r.int(8, 120),
      kind: i < 6 ? "Built in" : "Custom",
    })),
    form: [{ title: "Role", fields: [
      { name: "name", label: "Name", required: true },
      { name: "description", label: "Description", type: "textarea", wide: true },
    ] }],
    createLabel: "Create role",
  },
];

export const resources: Resource[] = list;

const bySlug = new Map(list.map((resource) => [resource.slug, resource]));

export function getResource(slug: string): Resource | undefined {
  return bySlug.get(slug);
}

export function getRow(resource: Resource, id: string): Row | undefined {
  return resource.rows.find((row) => row.id === id);
}

export function rowTitle(resource: Resource, row: Row): string {
  return String(row[resource.titleKey] ?? `${resource.singular} ${row.id}`);
}

export { SCHOOL };
