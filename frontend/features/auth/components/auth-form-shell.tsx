import type { ReactNode } from "react";
import Link from "next/link";

type AuthFormShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
};

export function AuthFormShell({ eyebrow, title, description, footer, children }: Readonly<AuthFormShellProps>) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
      <Link className="auth-back-link" href="/">
        Back to dashboard
      </Link>
    </main>
  );
}
