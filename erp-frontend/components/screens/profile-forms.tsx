"use client";

import { Laptop, ShieldCheck, Smartphone } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CURRENT_USER } from "@/lib/mock";

/** Two-column section: description on the left, form on the right. */
function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-b pb-10 last:border-0 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function useSaved(message: string) {
  const toast = useToast();
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    toast({ title: message, description: "Demo data only — the backend is not connected yet." });
  };
}

export function ProfileForms() {
  const toast = useToast();
  const [twoFactor, setTwoFactor] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saveProfile = useSaved("Profile saved");
  const savePassword = useSaved("Password updated");

  return (
    <div className="grid max-w-5xl gap-10">
      <FormSection title="Profile information" description="Update your account's profile information and email address.">
        <form onSubmit={saveProfile} className="grid gap-5 sm:grid-cols-2">
          <div className="flex items-center gap-4 sm:col-span-2">
            <Avatar name={CURRENT_USER.name} size="xl" />
            <div className="grid gap-2">
              <label htmlFor="photo" className="text-sm text-muted-foreground">
                Photo
              </label>
              <Input id="photo" type="file" accept="image/jpeg,image/png" />
            </div>
          </div>
          <Field label="Name" htmlFor="name">
            <Input id="name" defaultValue={CURRENT_USER.name} required />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" defaultValue={CURRENT_USER.email} required />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" type="tel" defaultValue="+92 300 5551234" />
          </Field>
          <Field label="Role" htmlFor="role">
            <Input id="role" defaultValue={CURRENT_USER.role} readOnly className="bg-muted/50" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </FormSection>

      <FormSection title="Update password" description="Use a long, random password to keep your account secure.">
        <form onSubmit={savePassword} className="grid max-w-md gap-5">
          <Field label="Current password" htmlFor="current_password">
            <Input id="current_password" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password" htmlFor="password">
            <Input id="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <Field label="Confirm password" htmlFor="password_confirmation">
            <Input id="password_confirmation" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <div>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </FormSection>

      <FormSection title="Two-factor authentication" description="Add extra security to your account using two-factor authentication.">
        <div className="grid gap-4">
          <p className="flex items-center gap-2 font-medium">
            <ShieldCheck className="size-4" />
            {twoFactor ? "You have enabled two-factor authentication." : "You have not enabled two-factor authentication."}
          </p>
          <p className="max-w-xl text-sm text-muted-foreground">
            When two-factor authentication is enabled, you will be asked for a secure, random code during sign-in. You can
            get this code from your phone&apos;s authenticator app.
          </p>
          {twoFactor && (
            <div className="grid max-w-md grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm">
              {["9f2k-a71x", "p3dd-0qke", "m8vt-2rj5", "c61w-hh4n", "zz7q-k3pa", "u5ye-91bd"].map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
          )}
          <div>
            <Button
              variant={twoFactor ? "destructive" : "default"}
              onClick={() => {
                setTwoFactor(!twoFactor);
                toast({ title: twoFactor ? "Two-factor authentication disabled" : "Two-factor authentication enabled" });
              }}
            >
              {twoFactor ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Browser sessions"
        description="Manage and log out your active sessions on other browsers and devices."
      >
        <div className="grid gap-4">
          <ul className="grid gap-4">
            {[
              { icon: Laptop, device: "Windows · Chrome", where: "Rawalpindi · 182.185.4.21", when: "This device" },
              { icon: Smartphone, device: "Android · Chrome", where: "Islamabad · 39.32.110.8", when: "Last active 2 hours ago" },
            ].map(({ icon: Icon, device, where, when }) => (
              <li key={device} className="flex items-center gap-3">
                <Icon className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm">{device}</p>
                  <p className="text-xs text-muted-foreground">
                    {where} · {when === "This device" ? <span className="font-semibold text-success">This device</span> : when}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div>
            <Button variant="outline" onClick={() => setConfirmLogout(true)}>
              Log out other browser sessions
            </Button>
          </div>
        </div>
      </FormSection>

      <FormSection title="Delete account" description="Permanently delete your account.">
        <div className="grid gap-4">
          <p className="max-w-xl text-sm text-muted-foreground">
            Once your account is deleted, all of its resources and data will be permanently deleted. Before deleting your
            account, download any data you wish to keep.
          </p>
          <div>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete account
            </Button>
          </div>
        </div>
      </FormSection>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => toast({ title: "Other sessions logged out" })}
        title="Log out other browser sessions?"
        description="You stay signed in on this device."
        confirmLabel="Log out other sessions"
        destructive={false}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => toast({ title: "Account deletion is disabled in the demo", tone: "error" })}
        title="Delete your account?"
        description="Your account and everything in it will be permanently deleted."
        confirmLabel="Delete account"
      />
    </div>
  );
}
