"use client";

export type GuideCharacterPose = "welcome" | "point-left" | "point-right" | "thinking" | "farewell";

export type GuidePlacement = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "left" | "right";

export type GuideHighlightStyle = "card" | "navigation" | "region";

export type GuideLayoutMode = "default" | "beside-target" | "center-cluster" | "sidebar-adjacent";

export type GuideCharacterAnchor = "center" | "upper" | "top";

export type GuideDialog = {
  eyebrow: string;
  message: string;
};

export type GuideStep = {
  id: string;
  target: string;
  dialog: GuideDialog;
  characterPose: GuideCharacterPose;
  preferredCharacterPlacements: GuidePlacement[];
  preferredBubblePlacements: GuidePlacement[];
  highlightStyle: GuideHighlightStyle;
  layoutMode?: GuideLayoutMode;
  characterAnchor?: GuideCharacterAnchor;
  mobileNavigationStep?: boolean;
};

export type GuideStatus = "completed" | "dismissed";

export type GuidePreference = {
  version: number;
  status: GuideStatus;
  completedAt: string;
  suppressContextualPrompts: boolean;
};

export type GuideCompletion = {
  status: GuideStatus;
  suppressContextualPrompts: boolean;
};
