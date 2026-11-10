"use client";

import { CreditCard } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/layout/logo";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { SCHOOL } from "@/lib/mock";
import type { Row } from "@/lib/resources";
import { formatDate, formatMoney } from "@/lib/utils";

/** A fee invoice with its lines, payments and a "take payment" dialog. */
export function InvoiceView({ row }: { row: Row }) {
  const toast = useToast();
  const amount = Number(row.amount);
  const [payments, setPayments] = useState(() =>
    Number(row.paid) > 0
      ? [{ date: String(row.issued), method: "Bank transfer", reference: `TRX-${row.id}0921`, amount: Number(row.paid) }]
      : [],
  );
  const [paying, setPaying] = useState(false);

  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(0, amount - paid);
  const status = balance === 0 ? "Paid" : paid > 0 ? "Partially paid" : String(row.status);

  const lines = [
    { item: "Tuition fee — November", amount: Math.round((amount * 0.7) / 100) * 100 },
    { item: "Computer lab fee", amount: Math.round((amount * 0.1) / 100) * 100 },
    { item: "Exam fee", amount: Math.round((amount * 0.12) / 100) * 100 },
  ];
  lines.push({ item: "Activities & sports", amount: amount - lines.reduce((sum, line) => sum + line.amount, 0) });

  const onPay = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = Math.min(balance, Number(data.get("amount")) || 0);
    if (value <= 0) return;
    setPayments((current) => [
      ...current,
      { date: String(data.get("date")), method: String(data.get("method")), reference: String(data.get("reference") || "—"), amount: value },
    ]);
    setPaying(false);
    toast({ title: `${formatMoney(value)} recorded`, description: `Payment against ${row.number}.` });
  };

  return (
    <div className="grid gap-10">
      <article className="mx-auto w-full max-w-4xl rounded-lg border bg-card p-6 shadow-sm print:border-0 print:p-0 print:shadow-none sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
          <div className="flex items-center gap-4">
            <Logo className="size-12 rounded-xl" />
            <div>
              <h2 className="text-lg font-semibold">{SCHOOL.name}</h2>
              <p className="text-sm text-muted-foreground">{SCHOOL.campus}</p>
              <p className="text-sm text-muted-foreground">{SCHOOL.phone}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">Fee invoice</p>
            <p className="font-mono text-sm">{row.number}</p>
            <div className="mt-2">
              <StatusBadge value={status} />
            </div>
          </div>
        </header>

        <dl className="grid gap-4 border-b py-6 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Billed to</dt>
            <dd className="mt-1 font-medium">{row.student}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Section</dt>
            <dd className="mt-1 font-medium">{row.section}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Issued</dt>
            <dd className="mt-1 font-medium">{formatDate(String(row.issued))}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Due</dt>
            <dd className="mt-1 font-medium">{formatDate(String(row.due))}</dd>
          </div>
        </dl>

        <table className="my-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 font-medium">Item</th>
              <th scope="col" className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.item} className="border-b">
                <td className="py-2.5">{line.item}</td>
                <td className="py-2.5 text-right tabular-nums">{formatMoney(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto grid max-w-xs gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="tabular-nums">{formatMoney(amount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="tabular-nums">{formatMoney(paid)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Balance due</dt>
            <dd className="tabular-nums">{formatMoney(balance)}</dd>
          </div>
        </dl>
      </article>

      <section aria-labelledby="payments-heading" className="mx-auto grid w-full max-w-4xl gap-4" data-print-hide>
        <SectionHeading title="Payments" id="payments-heading">
          <Button size="sm" disabled={balance === 0} onClick={() => setPaying(true)}>
            <CreditCard /> Take payment
          </Button>
        </SectionHeading>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="divide-y">
            {payments.map((payment, index) => (
              <li key={index} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>
                  <span className="font-medium">{payment.method}</span>
                  <span className="text-muted-foreground"> · {formatDate(payment.date)} · {payment.reference}</span>
                </span>
                <span className="font-medium tabular-nums">{formatMoney(payment.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={paying} onClose={() => setPaying(false)} title="Take payment" description={`Balance due: ${formatMoney(balance)}`}>
        <form onSubmit={onPay} className="grid gap-4">
          <Field label="Amount (Rs)" htmlFor="pay-amount">
            <Input id="pay-amount" name="amount" type="number" min={1} max={balance} defaultValue={balance} required />
          </Field>
          <Field label="Paid on" htmlFor="pay-date">
            <Input id="pay-date" name="date" type="date" defaultValue="2026-11-05" required />
          </Field>
          <Field label="Method" htmlFor="pay-method">
            <Select id="pay-method" name="method">
              <option>Cash</option>
              <option>Bank transfer</option>
              <option>Cheque</option>
              <option>JazzCash</option>
              <option>Easypaisa</option>
            </Select>
          </Field>
          <Field label="Reference" htmlFor="pay-reference">
            <Input id="pay-reference" name="reference" placeholder="Receipt or transaction number" />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPaying(false)}>
              Cancel
            </Button>
            <Button type="submit">Record payment</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
