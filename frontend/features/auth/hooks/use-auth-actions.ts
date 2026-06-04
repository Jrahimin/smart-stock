"use client";

import { useAuth } from "@/features/auth/context/auth-context";

export function useAuthActions() {
  const { login, register, logout, loginWithGoogleToken, loginWithFacebookToken, refreshCurrentSession } = useAuth();
  return {
    login,
    register,
    logout,
    loginWithGoogleToken,
    loginWithFacebookToken,
    refreshCurrentSession,
  };
}
