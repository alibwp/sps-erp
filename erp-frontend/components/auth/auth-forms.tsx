"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { signIn } from "@/components/auth/session";
import { ROLES, roleForEmail } from "@/lib/roles";

// Sign-in screens. None of them reach the backend yet: each form shows the
// state it would show after a successful request, so the flow can be walked.

function useSubmit(onDone: () => void, delay = 600) {
  const [submitting, setSubmitting] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      onDone();
    }, delay);
  };
  return { submitting, submit };
}

function SubmitButton({ submitting, children }: { submitting: boolean; children: ReactNode }) {
  return (
    <Button type="submit" className="h-11 w-full" disabled={submitting} aria-busy={submitting}>
      {submitting ? "Working..." : children}
    </Button>
  );
}

function PasswordInput({ id, name, autoComplete }: { id: string; name: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const { submitting, submit } = useSubmit(() => router.push("/dashboard"));

  return (
    <div className="space-y-6">
      <form
        onSubmit={(event) => {
          // The demo account's role decides which dashboard opens.
          signIn(roleForEmail(String(new FormData(event.currentTarget).get("email") ?? "")));
          submit(event);
        }}
        className="grid gap-5"
      >
        <Field label="Email address" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" autoFocus required placeholder="you@spsarmyschool.edu.pk" />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" name="password" autoComplete="current-password" />
        </Field>
        <label htmlFor="remember" className="flex items-center gap-3 text-sm text-muted-foreground">
          <input type="checkbox" id="remember" name="remember" />
          <span>Remember me</span>
        </label>
        <SubmitButton submitting={submitting}>Log in</SubmitButton>
      </form>

      <section className="space-y-3" aria-labelledby="demo-accounts-heading">
        <div className="space-y-1">
          <h2 id="demo-accounts-heading" className="text-sm font-medium">
            Try the demo as
          </h2>
          <p className="text-sm text-muted-foreground">
            Sign-in is not connected to the backend yet. Each role opens its own dashboard.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map(({ id, label, email }) => (
            <Button
              key={id}
              variant="outline"
              className="h-auto min-h-11 whitespace-normal py-2 text-center"
              disabled={submitting}
              onClick={() => {
                // Fill the form with the role's account and sign in, as the reference does.
                const emailInput = document.getElementById("email") as HTMLInputElement | null;
                const passwordInput = document.getElementById("password") as HTMLInputElement | null;
                if (!emailInput || !passwordInput) return;
                emailInput.value = email;
                passwordInput.value = "password";
                emailInput.form?.requestSubmit();
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const { submitting, submit } = useSubmit(() => setSent(true));

  if (sent) {
    return (
      <Alert tone="success" icon={MailCheck} title="Check your email">
        If an account uses that address, a link to reset the password is on its way.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required />
      </Field>
      <SubmitButton submitting={submitting}>Email password reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const { submitting, submit } = useSubmit(() => router.push("/login"));

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="New password" htmlFor="password" help="At least 8 characters.">
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" htmlFor="password_confirmation">
        <PasswordInput id="password_confirmation" name="password_confirmation" autoComplete="new-password" />
      </Field>
      <SubmitButton submitting={submitting}>Reset password</SubmitButton>
    </form>
  );
}

export function TwoFactorForm() {
  const router = useRouter();
  const [useRecovery, setUseRecovery] = useState(false);
  const { submitting, submit } = useSubmit(() => router.push("/dashboard"));

  return (
    <form onSubmit={submit} className="grid gap-5">
      {useRecovery ? (
        <Field label="Recovery code" htmlFor="recovery_code">
          <Input id="recovery_code" name="recovery_code" autoComplete="one-time-code" required autoFocus />
        </Field>
      ) : (
        <Field label="Code" htmlFor="code">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            className="text-center font-mono text-lg tracking-[0.5em]"
          />
        </Field>
      )}
      <SubmitButton submitting={submitting}>Log in</SubmitButton>
      <Button variant="link" className="justify-center" onClick={() => setUseRecovery(!useRecovery)}>
        {useRecovery ? "Use an authentication code" : "Use a recovery code"}
      </Button>
    </form>
  );
}

export function VerifyEmailForm() {
  const [sent, setSent] = useState(false);
  const { submitting, submit } = useSubmit(() => setSent(true));

  return (
    <form onSubmit={submit} className="grid gap-5">
      {sent && (
        <Alert tone="success" icon={MailCheck} title="Link sent">
          A new verification link has been sent to your email address.
        </Alert>
      )}
      <SubmitButton submitting={submitting}>Resend verification email</SubmitButton>
      <Link href="/login" className="text-center text-sm font-medium underline-offset-4 hover:underline">
        Log out
      </Link>
    </form>
  );
}

export function ConfirmPasswordForm() {
  const router = useRouter();
  const { submitting, submit } = useSubmit(() => router.push("/profile"));

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </Field>
      <SubmitButton submitting={submitting}>Confirm</SubmitButton>
    </form>
  );
}

export function AcceptInvitationForm() {
  const router = useRouter();
  const { submitting, submit } = useSubmit(() => router.push("/dashboard"));

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue="teacher@spsarmyschool.edu.pk" readOnly className="bg-muted/50" />
      </Field>
      <Field label="Choose a password" htmlFor="password" help="At least 8 characters.">
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirm password" htmlFor="password_confirmation">
        <PasswordInput id="password_confirmation" name="password_confirmation" autoComplete="new-password" />
      </Field>
      <SubmitButton submitting={submitting}>Set up my account</SubmitButton>
    </form>
  );
}
