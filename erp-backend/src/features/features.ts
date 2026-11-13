// The parts of the application a campus can switch off, as the reference's
// app/Enums/Feature.php lists them. Identity, access control, the audit log
// and enrollment history are not features: nothing works without them.
export const FEATURES = [
  'attendance',
  'portal',
  'discipline',
  'wellbeing',
  'staff_operations',
  'events',
  'ranking',
  'imports',
  'boarding',
  'library',
  'graduation_plans',
  'programmes',
] as const;

export type Feature = (typeof FEATURES)[number];

export function isFeature(value: string): value is Feature {
  return (FEATURES as readonly string[]).includes(value);
}

interface FeatureInfo {
  label: string;
  description: string;
  group: string;
  // Rankings, boarding and library stay off until a campus turns them on.
  defaultEnabled: boolean;
}

export const FEATURE_INFO: Record<Feature, FeatureInfo> = {
  attendance: {
    label: 'Attendance',
    description:
      'Daily and lesson registers, and the attendance a family reads.',
    group: 'Daily operations',
    defaultEnabled: true,
  },
  portal: {
    label: 'Student and guardian portal',
    description:
      'The area where learners and guardians sign in to read their own records.',
    group: 'Families and learners',
    defaultEnabled: true,
  },
  discipline: {
    label: 'Discipline and safeguarding',
    description: 'Behaviour records, incidents, and safeguarding cases.',
    group: 'Care and conduct',
    defaultEnabled: true,
  },
  wellbeing: {
    label: 'Student support and wellbeing',
    description: 'Health notes, counselling, and support plans.',
    group: 'Care and conduct',
    defaultEnabled: true,
  },
  staff_operations: {
    label: 'Staff operations',
    description: 'Staff leave, qualifications, and cover for absent teachers.',
    group: 'Staff and data',
    defaultEnabled: true,
  },
  events: {
    label: 'Calendar and events',
    description: 'The school calendar and the events on it.',
    group: 'Daily operations',
    defaultEnabled: true,
  },
  ranking: {
    label: 'Rankings',
    description: 'Positions that compare one learner with another.',
    group: 'Reporting',
    defaultEnabled: false,
  },
  imports: {
    label: 'Imports and integrations',
    description: 'Bulk uploads and links to outside systems.',
    group: 'Staff and data',
    defaultEnabled: true,
  },
  boarding: {
    label: 'Boarding',
    description:
      'Boarding houses, who sleeps where, and who is out for the night.',
    group: 'Beyond the classroom',
    defaultEnabled: false,
  },
  library: {
    label: 'Library',
    description: 'What the school lends, who has it, and when it is due back.',
    group: 'Beyond the classroom',
    defaultEnabled: false,
  },
  graduation_plans: {
    label: 'Graduation planning',
    description: 'Graduation requirements, pathways, and learner progress.',
    group: 'Learner pathways',
    defaultEnabled: true,
  },
  programmes: {
    label: 'Programmes',
    description: 'Clubs and activities outside the normal timetable.',
    group: 'Beyond the classroom',
    defaultEnabled: true,
  },
};

// The parts of the portal a campus can show or hide (reference
// app/Enums/PortalArea.php). An area nobody chose is shown.
export const PORTAL_AREAS = [
  'results',
  'attendance',
  'timetable',
  'calendar',
  'notices',
  'invoices',
  'documents',
  'requests',
  'library',
  'boarding',
  'graduation',
  'programmes',
  'syllabi',
] as const;

// The settings a feature keeps in feature_settings.config, each a switch
// that defaults to on. Only these two features have settings in the
// reference: which registers attendance offers, and which portal areas
// families see.
export const FEATURE_CONFIG_KEYS: Partial<Record<Feature, readonly string[]>> =
  {
    attendance: ['daily_register', 'lesson_register'],
    portal: PORTAL_AREAS,
  };
