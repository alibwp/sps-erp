"use client";

import { Copy, Laptop, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRef, useState, type FormEvent } from "react";
import { FormError, FormSection, Loaded } from "@/components/ui/api-states";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { updateUser, useSession } from "@/components/auth/session";
import { formatDate } from "@/lib/utils";
import { useApiMutation, useApiQuery } from "@/lib/use-api";

// The signed-in person's own account: profile, photo, password, two-factor
// and browser sessions. Everything here talks to the backend; the two-factor
// and "log out other sessions" actions need a recent password confirmation,
// which authorizedApi() asks for by opening /confirm-password and coming back.

/** GET /v1/me. */
type MeDto = {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  twoFactorEnabled: boolean;
  birthday: string | null;
  gender: Gender | null;
  phone: string | null;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  nationality: string | null;
  profilePhotoUrl: string | null;
};

/** GET /v1/auth/sessions, newest use first. */
type SessionDto = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
};

type TwoFactorStatus = { enabled: boolean; confirmed: boolean; recoveryCodesRemaining: number };
type TwoFactorSetup = { secret: string; otpauthUrl: string; recoveryCodes: string[] };

const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"] as const;
type Gender = (typeof GENDERS)[number];

/** The optional text fields of PATCH /v1/me; an empty box clears the field (null). */
const OPTIONAL_FIELDS = [
  "phone",
  "birthday",
  "gender",
  "address",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
  "nationality",
] as const;


export function ProfileForms() {
  const me = useApiQuery<MeDto>("/v1/me", { keepPrevious: true });
  const sessions = useApiQuery<SessionDto[]>("/v1/auth/sessions", { keepPrevious: true });

  return (
    <div className="grid max-w-5xl gap-10">
      <FormSection title="Profile information" description="Update your account's profile information and email address.">
        <Loaded query={me}>{(data) => <ProfileSection me={data} onSaved={me.reload} />}</Loaded>
      </FormSection>

      <FormSection title="Update password" description="Use a long, random password to keep your account secure.">
        <PasswordSection onChanged={sessions.reload} />
      </FormSection>

      <FormSection title="Two-factor authentication" description="Add extra security to your account using two-factor authentication.">
        <TwoFactorSection />
      </FormSection>

      <FormSection title="Browser sessions" description="Manage and log out your active sessions on other browsers and devices.">
        <Loaded query={sessions}>{(data) => <SessionsSection sessions={data} onChanged={sessions.reload} />}</Loaded>
      </FormSection>
    </div>
  );
}

// ---------------------------------------------------------------- Profile

function ProfileSection({ me, onSaved }: { me: MeDto; onSaved: () => void }) {
  const toast = useToast();
  const { role } = useSession();
  const save = useApiMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const body: Record<string, string | null> = { name: text("name"), email: text("email") };
    for (const field of OPTIONAL_FIELDS) body[field] = text(field) || null;

    const sent = await save.send<MeDto>("/v1/me", { method: "PATCH", body });
    if (!sent.ok) return;
    updateUser(sent.data);
    onSaved();
    const emailChanged = sent.data.email !== me.email;
    toast({
      title: "Profile saved",
      description: emailChanged ? `We sent a verification link to ${sent.data.email}.` : undefined,
    });
  }

  const errors = save.fieldErrors;
  const fieldNames = ["name", "email", ...OPTIONAL_FIELDS];

  return (
    <div className="grid gap-6">
      <PhotoPicker me={me} onChanged={onSaved} />

      {/* Re-mount on every new answer so the boxes show what was saved. */}
      <form key={JSON.stringify(me)} onSubmit={submit} onChange={save.clear} className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input id="name" name="name" defaultValue={me.name} required maxLength={100} autoComplete="name" />
        </Field>
        <Field
          label="Email"
          htmlFor="email"
          error={errors.email}
          help={me.emailVerifiedAt ? undefined : "Not verified yet. Check your inbox for the link."}
        >
          <Input id="email" name="email" type="email" defaultValue={me.email} required maxLength={100} autoComplete="email" />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={me.phone ?? ""} maxLength={100} autoComplete="tel" />
        </Field>
        <Field label="Role" htmlFor="role">
          <Input id="role" value={role.label} readOnly className="bg-muted/50" />
        </Field>
        <Field label="Birthday" htmlFor="birthday" error={errors.birthday}>
          <Input id="birthday" name="birthday" type="date" defaultValue={me.birthday ?? ""} autoComplete="bday" />
        </Field>
        <Field label="Gender" htmlFor="gender" error={errors.gender}>
          <Select id="gender" name="gender" defaultValue={me.gender ?? ""}>
            <option value="">Not set</option>
            {GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {gender}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Address" htmlFor="address" error={errors.address} className="sm:col-span-2">
          <Input id="address" name="address" defaultValue={me.address ?? ""} maxLength={255} autoComplete="address-line1" />
        </Field>
        <Field label="Address line 2" htmlFor="addressLine2" error={errors.addressLine2} className="sm:col-span-2">
          <Input
            id="addressLine2"
            name="addressLine2"
            defaultValue={me.addressLine2 ?? ""}
            maxLength={255}
            autoComplete="address-line2"
          />
        </Field>
        <Field label="City" htmlFor="city" error={errors.city}>
          <Input id="city" name="city" defaultValue={me.city ?? ""} maxLength={100} autoComplete="address-level2" />
        </Field>
        <Field label="State / province" htmlFor="state" error={errors.state}>
          <Input id="state" name="state" defaultValue={me.state ?? ""} maxLength={100} autoComplete="address-level1" />
        </Field>
        <Field label="Postal code" htmlFor="postalCode" error={errors.postalCode}>
          <Input id="postalCode" name="postalCode" defaultValue={me.postalCode ?? ""} maxLength={30} autoComplete="postal-code" />
        </Field>
        <Field label="Country" htmlFor="country" error={errors.country}>
          <Input id="country" name="country" defaultValue={me.country ?? ""} maxLength={100} autoComplete="country-name" />
        </Field>
        <Field label="Nationality" htmlFor="nationality" error={errors.nationality}>
          <Input id="nationality" name="nationality" defaultValue={me.nationality ?? ""} maxLength={100} />
        </Field>
        <div className="sm:col-span-2">
          <FormError error={save.error} fields={fieldNames} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={save.submitting}>
            {save.submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Uploads a photo as soon as one is picked; the header shows it right away. */
function PhotoPicker({ me, onChanged }: { me: MeDto; onChanged: () => void }) {
  const toast = useToast();
  const photo = useApiMutation();
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const body = new FormData();
    body.append("photo", file);
    const sent = await photo.send<MeDto>("/v1/me/photo", { method: "POST", body });
    if (input.current) input.current.value = "";
    if (!sent.ok) return;
    updateUser(sent.data);
    onChanged();
    toast({ title: "Photo updated" });
  }

  async function remove() {
    const sent = await photo.send<MeDto>("/v1/me/photo", { method: "DELETE" });
    if (!sent.ok) return;
    updateUser(sent.data);
    onChanged();
    toast({ title: "Photo removed" });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name={me.name} src={me.profilePhotoUrl} size="xl" />
      <div className="grid gap-2">
        <label htmlFor="photo" className="text-sm text-muted-foreground">
          Photo (JPG or PNG, up to 3 MB)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            ref={input}
            id="photo"
            type="file"
            accept="image/jpeg,image/png"
            disabled={photo.submitting}
            className="max-w-xs"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void upload(file);
            }}
          />
          {me.profilePhotoUrl && (
            <Button variant="outline" size="sm" disabled={photo.submitting} onClick={() => void remove()}>
              Remove photo
            </Button>
          )}
        </div>
        {photo.submitting && <p className="text-xs text-muted-foreground">Uploading…</p>}
        {photo.error && <p className="text-sm text-destructive">{photo.fieldErrors.photo ?? photo.error.message}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Password

function PasswordSection({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const change = useApiMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const sent = await change.send("/v1/me/password", {
      method: "PUT",
      body: {
        currentPassword: String(form.get("currentPassword") ?? ""),
        password: String(form.get("password") ?? ""),
        passwordConfirmation: String(form.get("passwordConfirmation") ?? ""),
      },
    });
    if (!sent.ok) return;
    formElement.reset();
    onChanged();
    toast({ title: "Password updated", description: "Your other browser sessions were signed out." });
  }

  const errors = change.fieldErrors;

  return (
    <form onSubmit={submit} onChange={change.clear} className="grid max-w-md gap-5">
      <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="password" error={errors.password} help="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm password" htmlFor="passwordConfirmation" error={errors.passwordConfirmation}>
        <Input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>
      <FormError error={change.error} fields={["currentPassword", "password", "passwordConfirmation"]} />
      <div>
        <Button type="submit" disabled={change.submitting}>
          {change.submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Two-factor

function TwoFactorSection() {
  const toast = useToast();
  const status = useApiQuery<TwoFactorStatus>("/v1/auth/two-factor", { keepPrevious: true });
  const action = useApiMutation();
  // The secret and recovery codes are shown only in the answer that made them.
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  async function start() {
    setCodes(null);
    const sent = await action.send<TwoFactorSetup>("/v1/auth/two-factor", { method: "POST" });
    if (sent.ok) {
      setSetup(sent.data);
      status.reload();
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    const sent = await action.send("/v1/auth/two-factor/confirm", { method: "POST", body: { code } });
    if (!sent.ok || !setup) return;
    setCodes(setup.recoveryCodes);
    setSetup(null);
    status.reload();
    toast({ title: "Two-factor authentication enabled" });
  }

  async function newCodes() {
    const sent = await action.send<{ recoveryCodes: string[] }>("/v1/auth/two-factor/recovery-codes", { method: "POST" });
    if (!sent.ok) return;
    setCodes(sent.data.recoveryCodes);
    status.reload();
    toast({ title: "New recovery codes created", description: "The old codes no longer work." });
  }

  async function disable() {
    const sent = await action.send("/v1/auth/two-factor", { method: "DELETE" });
    if (!sent.ok) return;
    setSetup(null);
    setCodes(null);
    status.reload();
    toast({ title: "Two-factor authentication disabled" });
  }

  return (
    <Loaded query={status}>
      {(twoFactor) => (
        <div className="grid gap-4">
          <p className="flex items-center gap-2 font-medium">
            {twoFactor.confirmed ? <ShieldCheck className="size-4 text-success" /> : <ShieldOff className="size-4" />}
            {twoFactor.confirmed
              ? "You have enabled two-factor authentication."
              : setup || twoFactor.enabled
                ? "Finish enabling two-factor authentication."
                : "You have not enabled two-factor authentication."}
          </p>
          <p className="max-w-xl text-sm text-muted-foreground">
            When two-factor authentication is enabled, you will be asked for a secure, random code during sign-in. You can
            get this code from your phone&apos;s authenticator app.
          </p>

          {setup && (
            <div className="grid max-w-xl gap-4 rounded-lg border p-4">
              <p className="text-sm">
                Scan this QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, Authy). If you
                can&apos;t scan it, enter the setup key by hand, or{" "}
                <a href={setup.otpauthUrl} className="font-medium underline underline-offset-4">
                  open it in the app
                </a>{" "}
                on this device.
              </p>
              {/* White box behind the code so phones can read it in dark mode too. */}
              <div className="w-fit rounded-md bg-white p-3">
                <QRCodeSVG value={setup.otpauthUrl} size={176} marginSize={0} aria-label="Two-factor setup QR code" />
              </div>
              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Setup key</span>
                <div className="flex items-center gap-2">
                  <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm break-all">
                    {setup.secret.match(/.{1,4}/g)?.join(" ")}
                  </code>
                  <CopyButton text={setup.secret} label="setup key" />
                </div>
              </div>
              <form onSubmit={confirm} onChange={action.clear} className="flex flex-wrap items-end gap-3">
                <Field label="Code from the app" htmlFor="code" error={action.fieldErrors.code} className="w-48">
                  <Input
                    id="code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9 ]{6,7}"
                    maxLength={7}
                    required
                    placeholder="123456"
                  />
                </Field>
                <Button type="submit" disabled={action.submitting}>
                  Confirm
                </Button>
                <Button variant="outline" onClick={() => setSetup(null)} disabled={action.submitting}>
                  Cancel
                </Button>
              </form>
            </div>
          )}

          {codes && (
            <div className="grid max-w-md gap-3">
              <p className="text-sm">
                Store these recovery codes somewhere safe. Each one signs you in once if you lose your phone. They are shown
                only now.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm">
                {codes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <CopyButton text={codes.join("\n")} label="recovery codes" withText />
                <Button variant="outline" size="sm" onClick={() => setCodes(null)}>
                  Done
                </Button>
              </div>
            </div>
          )}

          {twoFactor.confirmed && !codes && (
            <p className="text-sm text-muted-foreground">
              {twoFactor.recoveryCodesRemaining} recovery {twoFactor.recoveryCodesRemaining === 1 ? "code" : "codes"} left.
            </p>
          )}

          <FormError error={action.error} fields={setup ? ["code"] : []} />

          {!setup && (
            <div className="flex flex-wrap gap-2">
              {twoFactor.confirmed ? (
                <>
                  <Button variant="outline" onClick={() => void newCodes()} disabled={action.submitting}>
                    New recovery codes
                  </Button>
                  <Button variant="destructive" onClick={() => setConfirmDisable(true)} disabled={action.submitting}>
                    Disable
                  </Button>
                </>
              ) : (
                <Button onClick={() => void start()} disabled={action.submitting}>
                  {twoFactor.enabled ? "Start setup again" : "Enable"}
                </Button>
              )}
            </div>
          )}

          <ConfirmDialog
            open={confirmDisable}
            onClose={() => setConfirmDisable(false)}
            onConfirm={() => void disable()}
            title="Disable two-factor authentication?"
            description="Sign-in will only ask for your password. Your recovery codes stop working."
            confirmLabel="Disable"
          />
        </div>
      )}
    </Loaded>
  );
}

function CopyButton({ text, label, withText = false }: { text: string; label: string; withText?: boolean }) {
  const toast = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={`Copy ${label}`}
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => toast({ title: `Copied the ${label}` }),
          () => toast({ title: "Could not copy", tone: "error" }),
        )
      }
    >
      <Copy className="size-3.5" />
      {withText && "Copy"}
    </Button>
  );
}

// ---------------------------------------------------------------- Sessions

/** "Windows · Chrome" from a user agent string; good enough to tell devices apart. */
function describeDevice(userAgent: string | null): { label: string; mobile: boolean } {
  if (!userAgent) return { label: "Unknown device", mobile: false };
  const os =
    [
      [/Android/i, "Android"],
      [/iPhone|iPad|iPod/i, "iOS"],
      [/Windows/i, "Windows"],
      [/Mac OS X|Macintosh/i, "macOS"],
      [/CrOS/i, "ChromeOS"],
      [/Linux/i, "Linux"],
    ].find(([pattern]) => (pattern as RegExp).test(userAgent))?.[1] ?? "Unknown system";
  const browser =
    [
      [/Edg\//i, "Edge"],
      [/OPR\/|Opera/i, "Opera"],
      [/Firefox\//i, "Firefox"],
      [/Chrome\//i, "Chrome"],
      [/Safari\//i, "Safari"],
    ].find(([pattern]) => (pattern as RegExp).test(userAgent))?.[1] ?? "Unknown browser";
  return { label: `${os} · ${browser}`, mobile: /Mobile|Android|iPhone|iPad/i.test(userAgent) };
}

function lastActive(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "Active just now";
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (minutes < 60) return `Last active ${relative.format(-minutes, "minute")}`;
  if (minutes < 60 * 24) return `Last active ${relative.format(-Math.round(minutes / 60), "hour")}`;
  return `Last active ${formatDate(iso)}`;
}

function SessionsSection({ sessions, onChanged }: { sessions: SessionDto[]; onChanged: () => void }) {
  const toast = useToast();
  const action = useApiMutation();
  const [confirmOthers, setConfirmOthers] = useState(false);
  const others = sessions.filter((session) => !session.current).length;

  async function revoke(id: string) {
    const sent = await action.send(`/v1/auth/sessions/${id}`, { method: "DELETE" });
    if (!sent.ok) return;
    onChanged();
    toast({ title: "Session logged out" });
  }

  async function revokeOthers() {
    const sent = await action.send<{ revoked: number }>("/v1/auth/sessions/revoke-others", { method: "POST" });
    if (!sent.ok) return;
    onChanged();
    const count = sent.data.revoked;
    toast({ title: count === 1 ? "1 other session logged out" : `${count} other sessions logged out` });
  }

  return (
    <div className="grid gap-4">
      <ul className="grid gap-4">
        {sessions.map((session) => {
          const device = describeDevice(session.userAgent);
          const Icon = device.mobile ? Smartphone : Laptop;
          return (
            <li key={session.id} className="flex items-center gap-3">
              <Icon className="size-8 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{device.label}</p>
                <p className="text-xs text-muted-foreground">
                  {session.ipAddress ?? "Unknown address"} ·{" "}
                  {session.current ? (
                    <span className="font-semibold text-success">This device</span>
                  ) : (
                    lastActive(session.lastUsedAt)
                  )}
                </p>
              </div>
              {!session.current && (
                <Button variant="ghost" size="sm" disabled={action.submitting} onClick={() => void revoke(session.id)}>
                  Log out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <FormError error={action.error} />
      {others > 0 && (
        <div>
          <Button variant="outline" disabled={action.submitting} onClick={() => setConfirmOthers(true)}>
            Log out other browser sessions
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmOthers}
        onClose={() => setConfirmOthers(false)}
        onConfirm={() => void revokeOthers()}
        title="Log out other browser sessions?"
        description="You stay signed in on this device."
        confirmLabel="Log out other sessions"
        destructive={false}
      />
    </div>
  );
}
