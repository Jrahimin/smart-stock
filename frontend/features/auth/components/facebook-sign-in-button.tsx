"use client";

import { frontendConfig } from "@/lib/frontend-config";

type FacebookSignInButtonProps = {
  onToken: (accessToken: string) => Promise<void>;
};

export function FacebookSignInButton({ onToken }: Readonly<FacebookSignInButtonProps>) {
  if (!frontendConfig.facebookAppId) {
    return null;
  }

  return (
    <button
      className="auth-secondary-button"
      type="button"
      onClick={() => {
        void onToken("");
      }}
      disabled
    >
      Facebook sign-in is configured on the backend and can be wired to the Meta SDK later.
    </button>
  );
}
