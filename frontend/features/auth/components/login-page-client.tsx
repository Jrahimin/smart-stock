"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { AuthFormShell } from "@/features/auth/components/auth-form-shell";
import { FacebookSignInButton } from "@/features/auth/components/facebook-sign-in-button";
import { GoogleSignInButton } from "@/features/auth/components/google-sign-in-button";
import { useAuth } from "@/features/auth/context/auth-context";

function getSafeRedirect(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

export function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithGoogleToken, loginWithFacebookToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = getSafeRedirect(searchParams.get("redirect"));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push(redirectTo);
    } catch {
      setError("Login failed. Check your email, password, and email verification status.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleToken(idToken: string) {
    setError(null);
    try {
      await loginWithGoogleToken(idToken);
      router.push(redirectTo);
    } catch {
      setError("Google sign-in failed. Please try again.");
    }
  }

  return (
    <AuthFormShell
      eyebrow="Account Access"
      title="Sign in to Smart Stock"
      description="Use password login or Google to access user-specific features like watchlists."
      footer={
        <>
          New here? <Link href="/register">Create an account</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="auth-primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <div className="auth-divider">or continue with</div>
      <GoogleSignInButton onToken={handleGoogleToken} onError={setError} />
      <FacebookSignInButton onToken={loginWithFacebookToken} />
    </AuthFormShell>
  );
}
