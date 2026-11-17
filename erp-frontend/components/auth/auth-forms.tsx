"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Eye, EyeOff, MailCheck } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { answerChallenge, authorizedApi, hasPendingChallenge, login, logout, useAuth } from "@/components/auth/session";
import { api, ApiError } from "@/lib/api";
import { fieldErrorsOf, messageOf, toApiError } from "@/lib/use-api";

// Sign-in screens. Login, the two-factor code and accepting an invitation
// talk to the backend, as do the password reset, email verification and
// password confirmation screens.

/**
 * One backend request from a form: its progress and its failure, with the
 * validation messages by field name (the backend's names, e.g.
 * passwordConfirmation).
 */
function useRequest() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /** Runs `request`; true when it worked. */
  async function run(request: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    setSubmitting(true);
    try {
      await request();
      return true;
    } catch (failure) {
      setError(toApiError(failure));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, error, fields: fieldErrorsOf(error), run };
}

/**
 * The message for the alert above a form. Messages for fields the form shows
 * appear under those fields instead; any other message (a bad link token,
 * too many attempts) goes in the alert.
 */
function alertMessage(error: ApiError | null, shownFields: string[]): string | null {
  if (!error) return null;
  const fields = fieldErrorsOf(error);
  const hidden = Object.keys(fields).filter((name) => !shownFields.includes(name));
  if (hidden.length > 0) return fields[hidden[0]];
  return Object.keys(fields).length > 0 ? null : error.message;
}

/** A query parameter of the current address, read in the browser. */
function useSearchParam(name: string): string | null {
  return useSyncExternalStore(
    noChange,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
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

// Where to go next: the page that sent the person here (a path on this site
// only), or `fallback`.
function nextPath(fallback = "/dashboard"): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
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

/** Asks for a reset link. The backend answers the same whether or not the address has an account. */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const request = useRequest();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    const done = await request.run(() =>
      api("/v1/auth/forgot-password", { method: "POST", body: { email } }),
    );
    if (done) setSent(true);
  }

  if (sent) {
    return (
      <Alert tone="success" icon={MailCheck} title="Check your email">
        If an account uses that address, a link to reset the password is on its way.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <ErrorAlert message={alertMessage(request.error, ["email"])} />
      <Field label="Email address" htmlFor="email" error={request.fields.email}>
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required maxLength={100} />
      </Field>
      <SubmitButton submitting={request.submitting}>Email password reset link</SubmitButton>
    </form>
  );
}

/** Sets a new password with the token from the emailed link (/reset-password?token=…). */
export function ResetPasswordForm() {
  const token = useSearchParam("token");
  const [done, setDone] = useState(false);
  const request = useRequest();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const reset = await request.run(() =>
      api("/v1/auth/reset-password", {
        method: "POST",
        body: {
          token,
          password: String(form.get("password") ?? ""),
          passwordConfirmation: String(form.get("password_confirmation") ?? ""),
        },
      }),
    );
    if (reset) setDone(true);
  }

  if (done) {
    return (
      <div className="grid gap-5">
        <Alert tone="success" icon={MailCheck} title="Your password has been reset">
          Log in with your new password. Every other session of your account has been signed out.
        </Alert>
        <ButtonLink href="/login" className="h-11 w-full">
          Go to login
        </ButtonLink>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="grid gap-5">
        <Alert icon={CircleAlert}>This reset link is incomplete. Open the link from your email again, or ask for a new one.</Alert>
        <ButtonLink href="/forgot-password" className="h-11 w-full">
          Email me a new link
        </ButtonLink>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <ErrorAlert message={alertMessage(request.error, ["password", "passwordConfirmation"])} />
      <Field label="New password" htmlFor="password" help="At least 8 characters." error={request.fields.password}>
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" htmlFor="password_confirmation" error={request.fields.passwordConfirmation}>
        <PasswordInput id="password_confirmation" name="password_confirmation" autoComplete="new-password" />
      </Field>
      <SubmitButton submitting={request.submitting}>Reset password</SubmitButton>
      {request.fields.token && (
        <Link href="/forgot-password" className="text-center text-sm font-medium underline-offset-4 hover:underline">
          Email me a new link
        </Link>
      )}
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

/**
 * Two ways in: the emailed link (/verify-email?token=…), which verifies the
 * address straight away, and the backend's email_not_verified refusal,
 * which brings a signed-in person here to ask for a new link.
 */
export function VerifyEmailForm() {
  const token = useSearchParam("token");
  const session = useAuth();
  const [outcome, setOutcome] = useState<{ token: string; error: ApiError | null } | null>(null);

  useEffect(() => {
    if (!token) return;
    let current = true;
    api("/v1/auth/verify-email", { method: "POST", body: { token } }).then(
      () => {
        if (current) setOutcome({ token, error: null });
      },
      (failure: unknown) => {
        if (current) setOutcome({ token, error: toApiError(failure) });
      },
    );
    return () => {
      current = false;
    };
  }, [token]);

  const signedIn = session.status === "signed-in";

  if (token) {
    const result = outcome?.token === token ? outcome : null;
    if (!result) {
      return <p className="text-sm text-muted-foreground" aria-busy="true">Checking your link…</p>;
    }
    // "Already verified" is a 422 without a token message: the address is
    // verified either way.
    if (!result.error || (result.error.status === 422 && !result.error.fields.token)) {
      return (
        <div className="grid gap-5">
          <Alert tone="success" icon={MailCheck} title="Your email address is verified">
            Thank you. You can now use every part of SPS ERP your account allows.
          </Alert>
          <ButtonLink href={signedIn ? "/dashboard" : "/login"} className="h-11 w-full">
            {signedIn ? "Continue to dashboard" : "Go to login"}
          </ButtonLink>
        </div>
      );
    }
    return (
      <div className="grid gap-5">
        <ErrorAlert message={fieldErrorsOf(result.error).token ?? result.error.message} />
        <ResendVerification />
      </div>
    );
  }

  return <ResendVerification />;
}

/** Emails a new verification link to the signed-in person. */
function ResendVerification() {
  const router = useRouter();
  const session = useAuth();
  const [sent, setSent] = useState(false);
  const request = useRequest();

  if (session.status === "loading") return null;

  if (session.status === "signed-out") {
    return (
      <div className="grid gap-5">
        <p className="text-sm text-muted-foreground">Log in to get a new verification link.</p>
        <ButtonLink href="/login?next=/verify-email" className="h-11 w-full">
          Go to login
        </ButtonLink>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(false);
    const done = await request.run(() =>
      authorizedApi("/v1/auth/email/verification-notification", { method: "POST" }),
    );
    if (done) setSent(true);
  }

  async function signOut() {
    await logout().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <ErrorAlert message={alertMessage(request.error, [])} />
      {sent && (
        <Alert tone="success" icon={MailCheck} title="Link sent">
          A new verification link has been sent to {session.user.email}.
        </Alert>
      )}
      <SubmitButton submitting={request.submitting}>Resend verification email</SubmitButton>
      <Button variant="link" className="justify-center" onClick={signOut}>
        Log out
      </Button>
    </form>
  );
}

/**
 * Confirms the password before a sensitive action. The backend then allows
 * those actions for 3 hours; the person returns to the page that sent them.
 */
export function ConfirmPasswordForm() {
  const router = useRouter();
  const session = useAuth();
  const request = useRequest();

  if (session.status === "loading") return null;

  if (session.status === "signed-out") {
    return (
      <div className="grid gap-5">
        <Alert icon={CircleAlert}>Your session has ended. Please log in again.</Alert>
        <ButtonLink href="/login" className="h-11 w-full">
          Go to login
        </ButtonLink>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const done = await request.run(() =>
      authorizedApi("/v1/auth/confirm-password", { method: "POST", body: { password } }),
    );
    if (done) router.replace(nextPath("/profile"));
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <ErrorAlert message={alertMessage(request.error, ["password"])} />
      <Field label="Password" htmlFor="password" error={request.fields.password}>
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </Field>
      <SubmitButton submitting={request.submitting}>Confirm</SubmitButton>
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
