import { describe, expect, it } from "vitest";

import {
  clipRectToViewport,
  isTallGuideTarget,
  resolveCenteredClusterLayout,
  resolveCharacterFacing,
  resolveGuideBox,
  resolveSidebarAdjacentClusterLayout,
} from "@/features/guide/lib/guide-positioning";

const target = {
  top: 180,
  right: 420,
  bottom: 280,
  left: 220,
  width: 200,
  height: 100,
};

const contentBounds = {
  left: 280,
  top: 12,
  right: 1440,
  bottom: 900,
};

describe("resolveGuideBox", () => {
  it("chooses the preferred safe placement without overlapping the target", () => {
    expect(resolveGuideBox(target, ["right", "left"], 180, 160, 1200, 800)).toMatchObject({
      left: 440,
      top: 150,
    });
  });

  it("falls back to the next placement when the preferred one is off-screen", () => {
    const edgeTarget = { ...target, left: 980, right: 1180 };

    expect(resolveGuideBox(edgeTarget, ["right", "left"], 180, 160, 1200, 800)).toMatchObject({
      left: 784,
      top: 150,
    });
  });

  it("keeps the guide within the mobile viewport", () => {
    const box = resolveGuideBox(target, ["bottom-right"], 300, 210, 360, 640);

    expect(box).not.toBeNull();
    expect(box!.left).toBeGreaterThanOrEqual(12);
    expect(box!.top).toBeGreaterThanOrEqual(12);
    expect(box!.left + box!.width).toBeLessThanOrEqual(348);
    expect(box!.top + box!.height).toBeLessThanOrEqual(628);
  });

  it("keeps the character inside the main content bounds", () => {
    const sidebarTarget = { top: 120, right: 240, bottom: 168, left: 24, width: 216, height: 48 };
    const box = resolveGuideBox(
      sidebarTarget,
      ["bottom-right", "right"],
      180,
      250,
      1440,
      900,
      { bounds: contentBounds },
    );

    expect(box).not.toBeNull();
    expect(box!.left).toBeGreaterThanOrEqual(contentBounds.left + 16);
    expect(box!.left + box!.width).toBeLessThanOrEqual(contentBounds.right - 16);
  });
});

describe("resolveCharacterFacing", () => {
  it("faces left when the character sits to the right of the target", () => {
    const characterBox = { left: 500, top: 200, width: 180, height: 250 };
    expect(resolveCharacterFacing(characterBox, target)).toBe("left");
  });
});

describe("clipRectToViewport", () => {
  it("clips tall targets to the visible viewport window", () => {
    const tallTarget = { top: -120, right: 420, bottom: 980, left: 220, width: 200, height: 1100 };

    expect(clipRectToViewport(tallTarget, 1200, 800)).toMatchObject({
      top: 16,
      left: 220,
      width: 200,
      height: 768,
    });
  });
});

describe("isTallGuideTarget", () => {
  it("detects targets taller than half the viewport", () => {
    expect(isTallGuideTarget({ top: 0, right: 100, bottom: 500, left: 0, width: 100, height: 500 }, 800)).toBe(true);
    expect(isTallGuideTarget(target, 800)).toBe(false);
  });
});

describe("resolveCenteredClusterLayout", () => {
  it("centers the dialog and character together in the content area", () => {
    const layout = resolveCenteredClusterLayout(contentBounds, 900, 380, 220, 200, 280);

    expect(layout.character.left).toBeGreaterThanOrEqual(contentBounds.left + 16);
    expect(layout.bubble.left).toBe(layout.character.left + 200 + 20);
    expect(layout.character.top).toBeGreaterThanOrEqual(16);
  });
});

describe("resolveSidebarAdjacentClusterLayout", () => {
  it("places the mascot beside the sidebar and aligned with the nav target", () => {
    const navTarget = { top: 240, right: 248, bottom: 288, left: 24, width: 224, height: 48 };
    const layout = resolveSidebarAdjacentClusterLayout(navTarget, 272, 1440, 900, 380, 220, 180, 250);

    expect(layout.character.left).toBeGreaterThanOrEqual(280);
    expect(layout.bubble.left).toBeGreaterThan(layout.character.left);
    expect(layout.character.top + layout.character.height / 2).toBeCloseTo(264, 0);
  });
});
