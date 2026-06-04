import { backendApiGet, backendApiPatch, backendApiRequest } from "@/lib/api/backend-api-client";
import type { AuthMessage, AuthUser, TokenPair, UserGender } from "@/features/auth/types/auth-types";

export type RegisterPayload = {
  email: string;
  password: string;
  display_name: string;
  mobile_number?: string | null;
  gender?: UserGender | null;
  address?: string | null;
  profile_pic_url?: string | null;
};

export type UpdateProfilePayload = {
  display_name?: string | null;
  mobile_number?: string | null;
  gender?: UserGender | null;
  address?: string | null;
  profile_pic_url?: string | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type ChangePasswordPayload = {
  current_password: string;
  new_password: string;
};

export function registerUser(payload: RegisterPayload) {
  return backendApiRequest<AuthMessage>("/auth/register", {
    method: "POST",
    body: payload,
    skipAuthRefresh: true,
  });
}

export function verifyEmail(token: string) {
  return backendApiRequest<AuthMessage>("/auth/verify-email", {
    method: "POST",
    body: { token },
    skipAuthRefresh: true,
  });
}

export function resendVerification(email: string) {
  return backendApiRequest<AuthMessage>("/auth/resend-verification", {
    method: "POST",
    body: { email },
    skipAuthRefresh: true,
  });
}

export function loginUser(payload: LoginPayload) {
  return backendApiRequest<TokenPair>("/auth/login", {
    method: "POST",
    body: payload,
    skipAuthRefresh: true,
  });
}

export function refreshSession(refreshToken: string) {
  return backendApiRequest<TokenPair>("/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
    skipAuthRefresh: true,
  });
}

export function logoutUser(refreshToken: string) {
  return backendApiRequest<AuthMessage>("/auth/logout", {
    method: "POST",
    body: { refresh_token: refreshToken },
    skipAuthRefresh: true,
  });
}

export function getCurrentUser() {
  return backendApiGet<AuthUser>("/auth/me", undefined, { cache: "no-store" });
}

export function updateProfile(payload: UpdateProfilePayload) {
  return backendApiPatch<AuthUser>("/auth/me", payload);
}

export function changePassword(payload: ChangePasswordPayload) {
  return backendApiPatch<AuthMessage>("/auth/change-password", payload);
}

export function loginWithGoogle(idToken: string) {
  return backendApiRequest<TokenPair>("/auth/google", {
    method: "POST",
    body: { id_token: idToken },
    skipAuthRefresh: true,
  });
}

export function loginWithFacebook(accessToken: string) {
  return backendApiRequest<TokenPair>("/auth/facebook", {
    method: "POST",
    body: { access_token: accessToken },
    skipAuthRefresh: true,
  });
}
