"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  clearStoredAuthTokens,
  getStoredRefreshToken,
  setBackendAccessToken,
  setBackendAuthFailureHandler,
  setStoredRefreshToken,
} from "@/lib/api/backend-api-client";
import {
  changePassword as changePasswordRequest,
  getCurrentUser,
  loginUser,
  loginWithFacebook,
  loginWithGoogle,
  logoutUser,
  refreshSession,
  registerUser,
  setPassword as setPasswordRequest,
  updateProfile as updateProfileRequest,
  type ChangePasswordPayload,
  type RegisterPayload,
  type SetPasswordPayload,
  type UpdateProfilePayload,
} from "@/features/auth/services/auth-api";
import type { AuthUser, TokenPair } from "@/features/auth/types/auth-types";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogleToken: (idToken: string) => Promise<void>;
  loginWithFacebookToken: (accessToken: string) => Promise<void>;
  refreshCurrentSession: () => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<void>;
  changePassword: (payload: ChangePasswordPayload) => Promise<void>;
  setPassword: (payload: SetPasswordPayload) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    clearStoredAuthTokens();
    setUser(null);
  }, []);

  const applyTokenPair = useCallback(async (tokenPair: TokenPair) => {
    setBackendAccessToken(tokenPair.access_token);
    setStoredRefreshToken(tokenPair.refresh_token);
    const currentUser = await getCurrentUser();
    setUser(currentUser);
  }, []);

  const refreshCurrentSession = useCallback(async () => {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      clearSession();
      return;
    }

    const tokenPair = await refreshSession(refreshToken);
    await applyTokenPair(tokenPair);
  }, [applyTokenPair, clearSession]);

  useEffect(() => {
    setBackendAuthFailureHandler(() => {
      clearSession();
      const redirectPath = pathname && pathname !== "/login" ? `?redirect=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${redirectPath}`);
    });
    return () => setBackendAuthFailureHandler(null);
  }, [clearSession, pathname, router]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapSession() {
      try {
        const refreshToken = getStoredRefreshToken();
        if (!refreshToken) {
          clearSession();
          return;
        }

        const tokenPair = await refreshSession(refreshToken);
        await applyTokenPair(tokenPair);
      } catch {
        clearSession();
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void bootstrapSession();
    return () => {
      isMounted = false;
    };
  }, [applyTokenPair, clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokenPair = await loginUser({ email, password });
      await applyTokenPair(tokenPair);
    },
    [applyTokenPair],
  );

  const register = useCallback(async (payload: RegisterPayload) => {
    await registerUser(payload);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getStoredRefreshToken();
    clearSession();
    if (refreshToken) {
      try {
        await logoutUser(refreshToken);
      } catch {
        // Logout should finish locally even if the server session is already gone.
      }
    }
    router.push("/login");
  }, [clearSession, router]);

  const loginWithGoogleToken = useCallback(
    async (idToken: string) => {
      const tokenPair = await loginWithGoogle(idToken);
      await applyTokenPair(tokenPair);
    },
    [applyTokenPair],
  );

  const loginWithFacebookToken = useCallback(
    async (accessToken: string) => {
      const tokenPair = await loginWithFacebook(accessToken);
      await applyTokenPair(tokenPair);
    },
    [applyTokenPair],
  );

  const updateProfile = useCallback(async (payload: UpdateProfilePayload) => {
    const updatedUser = await updateProfileRequest(payload);
    setUser(updatedUser);
  }, []);

  const changePassword = useCallback(async (payload: ChangePasswordPayload) => {
    await changePasswordRequest(payload);
  }, []);

  const setPassword = useCallback(async (payload: SetPasswordPayload) => {
    await setPasswordRequest(payload);
    const updatedUser = await getCurrentUser();
    setUser(updatedUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      loginWithGoogleToken,
      loginWithFacebookToken,
      refreshCurrentSession,
      updateProfile,
      changePassword,
      setPassword,
    }),
    [
      changePassword,
      isLoading,
      login,
      loginWithFacebookToken,
      loginWithGoogleToken,
      logout,
      refreshCurrentSession,
      register,
      setPassword,
      updateProfile,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
