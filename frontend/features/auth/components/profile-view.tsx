"use client";

import { FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/features/auth/context/auth-context";
import type { UserGender } from "@/features/auth/types/auth-types";

export function ProfileView() {
  const { user, updateProfile, changePassword } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [gender, setGender] = useState<UserGender | "">("");
  const [address, setAddress] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    setDisplayName(user.display_name);
    setMobileNumber(user.mobile_number ?? "");
    setGender(user.gender ?? "");
    setAddress(user.address ?? "");
    setProfilePicUrl(user.profile_pic_url ?? "");
  }, [user]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage(null);
    setProfileError(null);
    setIsSavingProfile(true);

    try {
      await updateProfile({
        display_name: displayName.trim(),
        mobile_number: mobileNumber.trim() || null,
        gender: gender || null,
        address: address.trim() || null,
        profile_pic_url: profilePicUrl.trim() || null,
      });
      setProfileMessage("Profile updated.");
    } catch {
      setProfileError("Could not update profile. Check your details and try again.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    setIsSavingPassword(true);

    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Password updated.");
    } catch {
      setPasswordError("Could not change password. Check your current password and try again.");
    } finally {
      setIsSavingPassword(false);
    }
  }

  if (!user) {
    return null;
  }

  return (
    <section className="profile-view">
      <div className="explorer-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Your profile</h1>
          <span>Manage your display name, optional details, and password.</span>
        </div>
      </div>

      <div className="profile-grid">
        <section className="workspace-card profile-panel">
          <div className="section-heading">
            <p className="eyebrow">Profile</p>
            <h2>Personal details</h2>
            <span>Your username appears in the sidebar menu.</span>
          </div>

          <div className="profile-preview">
            {profilePicUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className="profile-preview-avatar" src={profilePicUrl} />
            ) : (
              <div aria-hidden="true" className="profile-preview-fallback">
                {displayName.trim().charAt(0).toUpperCase() || "U"}
              </div>
            )}
            <div>
              <strong>{displayName || user.display_name}</strong>
              <span>{user.email}</span>
            </div>
          </div>

          <form className="profile-form" onSubmit={handleProfileSubmit}>
            <label>
              Display name
              <input onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
            </label>
            <label>
              Email
              <input disabled readOnly value={user.email} />
            </label>
            <label>
              Profile picture URL
              <input
                onChange={(event) => setProfilePicUrl(event.target.value)}
                placeholder="https://example.com/avatar.png"
                type="url"
                value={profilePicUrl}
              />
            </label>
            <label>
              Mobile number
              <input onChange={(event) => setMobileNumber(event.target.value)} type="tel" value={mobileNumber} />
            </label>
            <label>
              Gender
              <select onChange={(event) => setGender(event.target.value as UserGender | "")} value={gender}>
                <option value="">Not specified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </label>
            <label>
              Address
              <input onChange={(event) => setAddress(event.target.value)} value={address} />
            </label>
            {profileError ? <p className="auth-error">{profileError}</p> : null}
            {profileMessage ? <p className="profile-success">{profileMessage}</p> : null}
            <button className="profile-submit-button" disabled={isSavingProfile} type="submit">
              {isSavingProfile ? "Saving..." : "Save profile"}
            </button>
          </form>
        </section>

        <section className="workspace-card profile-panel profile-panel-security">
          <div className="section-heading">
            <p className="eyebrow">Security</p>
            <h2>Change password</h2>
            <span>Use a strong password with at least 8 characters.</span>
          </div>

          <form className="profile-form profile-form-compact" onSubmit={handlePasswordSubmit}>
            <label>
              Current password
              <input
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
            </label>
            <label>
              New password
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </label>
            {passwordError ? <p className="auth-error">{passwordError}</p> : null}
            {passwordMessage ? <p className="profile-success">{passwordMessage}</p> : null}
            <button className="profile-submit-button" disabled={isSavingPassword} type="submit">
              {isSavingPassword ? "Updating..." : "Update password"}
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}
