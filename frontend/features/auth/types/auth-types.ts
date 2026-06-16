export type UserGender = "male" | "female" | "other" | "prefer_not_to_say";

export type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  mobile_number: string | null;
  gender: UserGender | null;
  address: string | null;
  profile_pic_url: string | null;
  role: UserRole;
  is_active: boolean;
  has_password: boolean;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
};

export type AuthMessage = {
  detail: string;
};
