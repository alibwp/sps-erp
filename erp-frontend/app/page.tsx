import Link from "next/link";
import { BackendStatus } from "@/components/backend-status";

const modules = [
  {
    name: "Inventory",
    description: "Track stock levels, warehouses, and item movements.",
  },
  {
    name: "Finance",
    description: "Invoices, payments, and the general ledger in one place.",
  },
  {
    name: "Sales",
    description: "Quotes, orders, and customers from first contact to delivery.",
  },
  {
    name: "Human Resources",
    description: "Employees, attendance, and payroll records.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
      <section className="py-20 text-center sm:py-28">
        <p className="text-sm font-medium uppercase tracking-wider text-blue-600">
          Enterprise resource planning
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">
          Welcome to SPS ERP
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Manage inventory, finance, sales, and people for your business from
          one place.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="rounded-md bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Sign in to your account
          </Link>
          <Link
            href="#status"
            className="rounded-md border border-black/15 px-5 py-3 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Check system status
          </Link>
        </div>
      </section>

      <section id="modules" className="scroll-mt-20 pb-16">
        <h2 className="text-2xl font-semibold tracking-tight">Modules</h2>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          The areas of your business SPS ERP brings together.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((module) => (
            <div
              key={module.name}
              className="rounded-xl border border-black/10 p-5 dark:border-white/10"
            >
              <h3 className="font-medium">{module.name}</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {module.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="status" className="scroll-mt-20 pb-24">
        <BackendStatus />
      </section>
    </main>
  );
}
