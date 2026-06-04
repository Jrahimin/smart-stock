"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { AuthFormShell } from "@/features/auth/components/auth-form-shell";
import { useAuth } from "@/features/auth/context/auth-context";

export default function RegisterPage() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register({
        display_name: displayName,
        email,
        password,
        mobile_number: mobileNumber.trim() || null,
        gender: gender ? (gender as "male" | "female" | "other" | "prefer_not_to_say") : null,
        address: address.trim() || null,
      });
      setSuccess(true);
    } catch {
      setError("Registration failed. The email may already be registered.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthFormShell
      eyebrow="Account Setup"
      title="Create your Smart Stock account"
      description="Register with email and password. You must verify your email before signing in."
      footer={
        <>
          Already registered? <Link href="/login">Sign in</Link>
        </>
      }
    >
      {success ? (
        <div className="auth-success">
          <h2>Check your email</h2>
          <p>We sent a verification link. Open it before signing in.</p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={8}
              required
            />
          </label>
          <label>
            Mobile number <span className="auth-optional">(optional)</span>
            <input value={mobileNumber} onChange={(event) => setMobileNumber(event.target.value)} type="tel" />
          </label>
          <label>
            Gender <span className="auth-optional">(optional)</span>
            <select value={gender} onChange={(event) => setGender(event.target.value)}>
              <option value="">Not specified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </label>
          <label>
            Address <span className="auth-optional">(optional)</span>
            <input value={address} onChange={(event) => setAddress(event.target.value)} />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="auth-primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>
      )}
    </AuthFormShell>
  );
}
