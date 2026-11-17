"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff, MailCheck } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { answerChallenge, hasPendingChallenge, login, useAuth } from "@/components/auth/session";
import { api, ApiError } from "@/lib/api";

// Sign-in screens. Login, the two-factor code and accepting an invitation
// talk to the backend; the others still only show the state they would show
// after a successful request.

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

// Where to go after signing in: the page that sent the person here, or the
// dashboard.
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert tone="destructive" icon={CircleAlert}>
      {message}
    </Alert>
  );
}

export function LoginForm() {
  const router = useRouter();
  const session = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Next keeps a page the person has left mounted but hidden. The form starts
  // over when they leave: no password kept in the page and no "Working..."
  // waiting for them after they sign out.
  useEffect(() => {
    const form = formRef.current;
    return () => {
      form?.reset();
      setError(null);
      setSubmitting(false);
    };
  }, []);

  // Already signed in (the refresh cookie restored the session).
  useEffect(() => {
    if (session.status === "signed-in") router.replace(nextPath());
  }, [session.status, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      if (outcome === "two-factor") router.push("/two-factor-challenge");
      else router.replace(nextPath());
    } catch (failure) {
      setError(messageOf(failure));
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-5">
      <ErrorAlert message={error} />
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required />
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </Field>
      <SubmitButton submitting={submitting}>Log in</SubmitButton>
    </form>
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

const noChange = () => () => undefined;

export function TwoFactorForm() {
  const router = useRouter();
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The login that asked for the code lives in this page's memory only.
  const pending = useSyncExternalStore(noChange, hasPendingChallenge, () => true);
  const formRef = useRef<HTMLFormElement>(null);

  // Starts over when the person leaves the page (see LoginForm).
  useEffect(() => {
    const form = formRef.current;
    return () => {
      form?.reset();
      setError(null);
      setSubmitting(false);
      setUseRecovery(false);
    };
  }, []);

  // A correct code ends the challenge; keep the form until the next page shows.
  if (!pending && !submitting) {
    return (
      <div className="grid gap-5">
        <Alert icon={CircleAlert}>Your sign-in has expired. Please log in again.</Alert>
        <ButtonLink href="/login" className="h-11 w-full">
          Back to login
        </ButtonLink>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    try {
      await answerChallenge(
        useRecovery
          ? { recoveryCode: String(form.get("recovery_code") ?? "").trim() }
          : { code: String(form.get("code") ?? "").trim() },
      );
      router.replace(nextPath());
    } catch (failure) {
      setError(messageOf(failure));
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-5">
      <ErrorAlert message={error} />
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

type Invitation = { name: string; email: string; expiresAt: string };

/** Sets the first password of an invited account (the emailed link). */
export function InvitationForm({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Invitation>(`/v1/invitations/${encodeURIComponent(token)}`)
      .then((found) => {
        if (!cancelled) setInvitation(found);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setProblem(messageOf(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    try {
      await api(`/v1/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: {
          password: String(form.get("password") ?? ""),
          passwordConfirmation: String(form.get("password_confirmation") ?? ""),
        },
      });
      setAccepted(true);
    } catch (failure) {
      const fields = failure instanceof ApiError ? Object.values(failure.fields).flat() : [];
      setError(fields[0] ?? messageOf(failure));
      setSubmitting(false);
    }
  }

  if (accepted) {
    return (
      <div className="grid gap-5">
        <Alert tone="success" icon={MailCheck} title="Your account is ready">
          Log in with {invitation?.email ?? "your email address"} and the password you chose.
        </Alert>
        <ButtonLink href="/login" className="h-11 w-full">
          Go to login
        </ButtonLink>
      </div>
    );
  }

  if (problem) {
    return (
      <div className="grid gap-5">
        <Alert icon={CircleAlert}>{problem}</Alert>
        <Link href="/login" className="text-center text-sm font-medium underline-offset-4 hover:underline">
          Go to login
        </Link>
      </div>
    );
  }

  if (!invitation) {
    return <p className="text-sm text-muted-foreground" aria-busy="true">Checking your invitation…</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <ErrorAlert message={error} />
      <Field label="Name" htmlFor="name">
        <Input id="name" defaultValue={invitation.name} readOnly className="bg-muted/50" />
      </Field>
      <Field label="Email address" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={invitation.email} readOnly className="bg-muted/50" />
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
