import { Logo } from "@/components/layout/logo";
import { StatusBadge } from "@/components/ui/badge";
import { SCHOOL, SUBJECTS, createRandom } from "@/lib/mock";
import type { Row } from "@/lib/resources";

function gradeFor(percent: number) {
  if (percent >= 90) return { grade: "A+", remark: "Outstanding" };
  if (percent >= 80) return { grade: "A", remark: "Excellent" };
  if (percent >= 70) return { grade: "B", remark: "Very good" };
  if (percent >= 60) return { grade: "C", remark: "Good" };
  if (percent >= 50) return { grade: "D", remark: "Satisfactory" };
  return { grade: "F", remark: "Needs improvement" };
}

/** A printable term report card. */
export function ReportCardView({ row }: { row: Row }) {
  const random = createRandom(Number(row.id) * 17);
  const subjects = SUBJECTS.slice(0, 9).map((subject) => {
    const midterm = random.int(18, 30);
    const final = random.int(38, 70);
    const percent = midterm + final;
    return { subject, midterm, final, percent, ...gradeFor(percent) };
  });
  const average = Math.round(subjects.reduce((sum, entry) => sum + entry.percent, 0) / subjects.length);

  return (
    <article className="mx-auto w-full max-w-4xl rounded-lg border bg-card p-6 shadow-sm print:border-0 print:p-0 print:shadow-none sm:p-10">
      <header className="flex flex-wrap items-center gap-4 border-b pb-6">
        <Logo className="size-14 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{SCHOOL.name}</h2>
          <p className="text-sm text-muted-foreground">{SCHOOL.campus}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold uppercase tracking-wide">Report card</p>
          <p className="text-sm text-muted-foreground">
            {String(row.term)} · {String(row.year)}
          </p>
        </div>
      </header>

      <dl className="grid gap-4 border-b py-6 text-sm sm:grid-cols-4">
        {[
          ["Learner", row.student],
          ["Section", row.section],
          ["Position", `${row.position} of 32`],
          ["Status", null],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-medium">{label === "Status" ? <StatusBadge value={String(row.status)} /> : value}</dd>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto py-6">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-medium">Subject</th>
              <th scope="col" className="px-4 py-2 font-medium">Mid-term (30)</th>
              <th scope="col" className="px-4 py-2 font-medium">Final (70)</th>
              <th scope="col" className="px-4 py-2 font-medium">Total (100)</th>
              <th scope="col" className="px-4 py-2 font-medium">Grade</th>
              <th scope="col" className="py-2 pl-4 font-medium">Remark</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((entry) => (
              <tr key={entry.subject} className="border-b last:border-0">
                <th scope="row" className="py-2.5 pr-4 text-left font-medium">{entry.subject}</th>
                <td className="px-4 py-2.5 tabular-nums">{entry.midterm}</td>
                <td className="px-4 py-2.5 tabular-nums">{entry.final}</td>
                <td className="px-4 py-2.5 font-medium tabular-nums">{entry.percent}</td>
                <td className="px-4 py-2.5">{entry.grade}</td>
                <td className="py-2.5 pl-4 text-muted-foreground">{entry.remark}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2">
              <th scope="row" colSpan={3} className="py-3 pr-4 text-left">Average</th>
              <td className="px-4 py-3 font-semibold tabular-nums">{average}%</td>
              <td className="px-4 py-3 font-semibold">{gradeFor(average).grade}</td>
              <td className="py-3 pl-4 text-muted-foreground">{gradeFor(average).remark}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="grid gap-6 border-t pt-6 text-sm sm:grid-cols-2">
        <div>
          <h3 className="font-medium">Class teacher&apos;s remarks</h3>
          <p className="mt-2 text-muted-foreground">
            {String(row.student).split(" ")[0]} works hard and takes part well in class. Keep reading every day and
            practise past papers before the final examination.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6 self-end">
          {["Class teacher", "Principal"].map((who) => (
            <div key={who} className="border-t pt-2 text-center text-xs text-muted-foreground">
              {who}
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
