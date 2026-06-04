"use client";

import { GoogleLogin } from "@react-oauth/google";

import { frontendConfig } from "@/lib/frontend-config";

type GoogleSignInButtonProps = {
  onToken: (idToken: string) => Promise<void>;
  onError: (message: string) => void;
};

export function GoogleSignInButton({ onToken, onError }: Readonly<GoogleSignInButtonProps>) {
  if (!frontendConfig.googleClientId) {
    return null;
  }

  return (
    <div className="auth-social-button">
      <GoogleLogin
        onSuccess={(credentialResponse) => {
          if (!credentialResponse.credential) {
            onError("Google did not return an ID token.");
            return;
          }
          void onToken(credentialResponse.credential);
        }}
        onError={() => onError("Google sign-in failed. Please try again.")}
        size="large"
        text="signin_with"
        theme="outline"
        width="100%"
      />
    </div>
  );
}
