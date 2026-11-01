"use client";

import { useState, type FormEvent } from "react";

const inputClasses =
  "mt-1 block w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-white/15";

export function LoginForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // TODO: send the credentials to the backend once auth endpoints exist.
    setSubmitted(true);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <label className="block text-sm font-medium">
        Email
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className={inputClasses}
        />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className={inputClasses}
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        Sign in
      </button>
      {submitted && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Sign-in isn&apos;t connected to the backend yet.
        </p>
      )}
    </form>
  );
}
