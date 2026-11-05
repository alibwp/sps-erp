import { SectionHeading } from "@/components/ui/misc";
import { SUBJECTS, TEACHER_NAMES, createRandom } from "@/lib/mock";
import { cn } from "@/lib/utils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const PERIODS = [
  { label: "1", time: "08:00 – 08:40" },
  { label: "2", time: "08:40 – 09:20" },
  { label: "3", time: "09:20 – 10:00" },
  { label: "Break", time: "10:00 – 10:30", break: true },
  { label: "4", time: "10:30 – 11:10" },
  { label: "5", time: "11:10 – 11:50" },
  { label: "6", time: "11:50 – 12:30" },
  { label: "7", time: "12:30 – 13:10" },
];

const HUES = [12, 173, 197, 43, 27, 220, 160, 280, 340, 95, 250, 5];

/** A weekly lesson grid, days down the side and periods across. */
export function TimetableView({ seed }: { seed: number }) {
  const random = createRandom(seed * 97);
  const grid = DAYS.map(() =>
    PERIODS.map((period) =>
      period.break
        ? null
        : (() => {
            const subjectIndex = random.int(0, 9);
            return {
              subject: SUBJECTS[subjectIndex],
              teacher: TEACHER_NAMES[subjectIndex % TEACHER_NAMES.length],
              room: `Room ${random.int(101, 120)}`,
              hue: HUES[subjectIndex],
            };
          })(),
    ),
  );

  return (
    <section aria-labelledby="timetable-heading" className="grid gap-4">
      <SectionHeading title="Weekly timetable" id="timetable-heading" />
      <div className="beautify-scrollbar overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="w-28 border-b px-3 py-2 text-left font-medium text-muted-foreground">
                Day
              </th>
              {PERIODS.map((period) => (
                <th key={period.label} scope="col" className="border-b border-l px-2 py-2 text-left font-medium">
                  <span className="block">{period.break ? "Break" : `Period ${period.label}`}</span>
                  <span className="block whitespace-nowrap text-xs font-normal text-muted-foreground">{period.time}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, dayIndex) => (
              <tr key={day} className="border-b last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {day}
                </th>
                {grid[dayIndex].map((lesson, index) =>
                  lesson === null ? (
                    <td key={index} className="border-l bg-muted/40 px-2 text-center text-xs text-muted-foreground">
                      {dayIndex === 0 ? "Break" : ""}
                    </td>
                  ) : (
                    <td key={index} className="border-l p-1.5 align-top">
                      <div
                        className={cn("rounded-md border-l-4 px-2 py-1.5")}
                        style={{ borderLeftColor: `hsl(${lesson.hue} 60% 50%)`, backgroundColor: `hsl(${lesson.hue} 60% 50% / 0.08)` }}
                      >
                        <p className="truncate font-medium">{lesson.subject}</p>
                        <p className="truncate text-xs text-muted-foreground">{lesson.teacher}</p>
                        <p className="truncate text-xs text-muted-foreground">{lesson.room}</p>
                      </div>
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
