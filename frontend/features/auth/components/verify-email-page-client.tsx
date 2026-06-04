"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthFormShell } from "@/features/auth/components/auth-form-shell";
import { verifyEmail } from "@/features/auth/services/auth-api";

export function VerifyEmailPageClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"checking" | "verified" | "failed">("checking");

  useEffect(() => {
    async function runVerification() {
      if (!token) {
        setStatus("failed");
        return;
      }

      try {
        await verifyEmail(token);
        setStatus("verified");
      } catch {
        setStatus("failed");
      }
    }

    void runVerification();
  }, [token]);

  return (
    <AuthFormShell
      eyebrow="Email Verification"
      title="Verify your account"
      description="Smart Stock is checking your verification link."
      footer={<Link href="/login">Go to login</Link>}
    >
      {status === "checking" ? <p>Verifying your email...</p> : null}
      {status === "verified" ? (
        <div className="auth-success">
          <h2>Email verified</h2>
          <p>You can now sign in with your email and password.</p>
        </div>
      ) : null}
      {status === "failed" ? (
        <p className="auth-error">This verification link is invalid or expired. Request a new verification email.</p>
      ) : null}
    </AuthFormShell>
  );
}
