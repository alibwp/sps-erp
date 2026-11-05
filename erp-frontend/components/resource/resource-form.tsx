"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { getResource, getRow, rowTitle, type Field as FieldConfig } from "@/lib/resources";
import { cn } from "@/lib/utils";

/** Create and edit form for any resource, laid out in titled sections. */
export function ResourceForm({ slug, id }: { slug: string; id?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const resource = getResource(slug);
  if (!resource?.form) return null;

  const row = id ? getRow(resource, id) : undefined;
  const editing = row !== undefined;
  const backHref = editing ? `/${slug}/${row.id}` : `/${slug}`;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    const name = String(new FormData(event.currentTarget).get(resource.titleKey) ?? "") || (row ? rowTitle(resource, row) : resource.singular);
    window.setTimeout(() => {
      toast({
        title: editing ? `${name} updated` : `${resource.singular} saved`,
        description: "Demo data only — this will save once the backend API is connected.",
      });
      router.push(backHref);
    }, 500);
  };

  return (
    <form onSubmit={onSubmit} autoComplete="off" className="max-w-3xl space-y-6">
      {resource.form.map((group, groupIndex) => (
        <fieldset key={group.title} className={cn("grid gap-4 md:grid-cols-2", groupIndex > 0 && "border-t pt-6")}>
          <legend className="contents">
            <span className="text-base font-semibold md:col-span-2">{group.title}</span>
          </legend>
          {group.description && <p className="-mt-2 text-sm text-muted-foreground md:col-span-2">{group.description}</p>}
          {group.fields.map((field) => (
            <FormControl key={field.name} field={field} defaultValue={row?.[field.name]} />
          ))}
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button type="submit" className="h-11" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Saving..." : editing ? "Save changes" : (resource.submitLabel ?? `Save ${resource.singular.toLowerCase()}`)}
        </Button>
        <ButtonLink href={backHref} variant="ghost" className="h-11">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

function FormControl({ field, defaultValue }: { field: FieldConfig; defaultValue?: string | number | null }) {
  const id = `field-${field.name}`;
  const value = defaultValue ?? undefined;
  const wide = field.wide || field.type === "textarea";

  if (field.type === "checkbox") {
    return (
      <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm md:col-span-2">
        <input id={id} name={field.name} type="checkbox" defaultChecked={Boolean(value)} />
        <span>{field.label}</span>
      </label>
    );
  }

  let control;
  if (field.type === "select") {
    control = (
      <Select id={id} name={field.name} required={field.required} defaultValue={value === undefined ? "" : String(value)}>
        <option value="">Choose…</option>
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    );
  } else if (field.type === "textarea") {
    control = <Textarea id={id} name={field.name} required={field.required} placeholder={field.placeholder} defaultValue={value === undefined ? undefined : String(value)} />;
  } else if (field.type === "file") {
    control = <Input id={id} name={field.name} type="file" required={field.required} />;
  } else {
    control = (
      <Input
        id={id}
        name={field.name}
        type={field.type ?? "text"}
        required={field.required}
        placeholder={field.placeholder}
        defaultValue={value === undefined ? undefined : String(value)}
      />
    );
  }

  return (
    <Field label={`${field.label}${field.required ? " *" : ""}`} htmlFor={id} help={field.help} className={cn(wide && "md:col-span-2")}>
      {control}
    </Field>
  );
}
