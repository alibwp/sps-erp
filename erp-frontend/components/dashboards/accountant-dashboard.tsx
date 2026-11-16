import Link from "next/link";
import { SectionHeading } from "@/components/ui/misc";
import { FeesCollectedTrend, MoneyInOutTrend, OwedTrend } from "@/components/dashboards/finance-trends";
import { ActiveStudentsSnapshot, EnrolmentByClassTrend } from "@/components/dashboards/trends";
import { ACCOUNTANT_NAVIGATION, type NavItem } from "@/lib/nav";

/**
 * The accountant's dashboard, as the reference shows it: the one school
 * figure an accountant may read (active students), then the money trends and
 * enrolment by class. No setup card, attendance, calendar or notices, since
 * the accountant holds none of those permissions. Below the trends, every
 * finance module with a way into each of its screens.
 */
export function AccountantDashboard() {
  return (
    <div className="space-y-10">
      <ActiveStudentsSnapshot />

      <section className="space-y-6" aria-labelledby="trends-overview">
        <SectionHeading title="Trends" id="trends-overview" />
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-2">
          <FeesCollectedTrend />
          <OwedTrend />
          <MoneyInOutTrend />
          <EnrolmentByClassTrend />
        </div>
      </section>

      <FinanceModules />
    </div>
  );
}

type Module = Extract<NavItem, { children: unknown }>;

/** The modules of the accountant's sidebar (those with screens under them). */
const MODULES: Module[] = ACCOUNTANT_NAVIGATION.flatMap((group) =>
  group.items.filter((item): item is Module => "children" in item),
);

function FinanceModules() {
  return (
    <section className="space-y-6" aria-labelledby="finance-modules">
      <SectionHeading title="Finance modules" id="finance-modules" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((module) => {
          const Icon = module.icon;
          return (
            <div key={module.label} className="flex flex-col gap-4 rounded-lg border p-5">
              <Link href={module.children[0].href} className="group flex items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground group-hover:text-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium group-hover:underline">{module.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {module.children.length} {module.children.length === 1 ? "screen" : "screens"}
                  </span>
                </span>
              </Link>
              <ul className="flex flex-wrap gap-2">
                {module.children.map((child) => (
                  <li key={child.href}>
                    <Link
                      href={child.href}
                      className="inline-flex min-h-8 items-center rounded-full border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {child.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
