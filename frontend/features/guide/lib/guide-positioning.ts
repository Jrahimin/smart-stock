import type { GuidePlacement } from "@/features/guide/types/guide-types";

export type GuideRect = Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height">;

export type GuideBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type GuideBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const GAP = 20;
const VIEWPORT_INSET = 16;

function boxForPlacement(target: GuideRect, placement: GuidePlacement, width: number, height: number): GuideBox {
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;

  switch (placement) {
    case "left":
      return { left: target.left - width - GAP, top: centerY - height / 2, width, height };
    case "right":
      return { left: target.right + GAP, top: centerY - height / 2, width, height };
    case "top-left":
      return { left: target.left, top: target.top - height - GAP, width, height };
    case "top-right":
      return { left: target.right - width, top: target.top - height - GAP, width, height };
    case "bottom-left":
      return { left: target.left, top: target.bottom + GAP, width, height };
    case "bottom-right":
      return { left: target.right - width, top: target.bottom + GAP, width, height };
  }
}

function intersects(first: GuideBox, second: GuideBox) {
  return !(
    first.left + first.width <= second.left ||
    second.left + second.width <= first.left ||
    first.top + first.height <= second.top ||
    second.top + second.height <= first.top
  );
}

function fitsViewport(box: GuideBox, viewportWidth: number, viewportHeight: number, inset: number) {
  return (
    box.left >= inset &&
    box.top >= inset &&
    box.left + box.width <= viewportWidth - inset &&
    box.top + box.height <= viewportHeight - inset
  );
}

function fitsBounds(box: GuideBox, bounds: GuideBounds, inset: number) {
  return (
    box.left >= bounds.left + inset &&
    box.top >= bounds.top + inset &&
    box.left + box.width <= bounds.right - inset &&
    box.top + box.height <= bounds.bottom - inset
  );
}

function rectToBox(rect: GuideRect): GuideBox {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function clamp(
  box: GuideBox,
  viewportWidth: number,
  viewportHeight: number,
  inset: number,
  bounds?: GuideBounds,
): GuideBox {
  const minLeft = bounds ? bounds.left + inset : inset;
  const minTop = bounds ? bounds.top + inset : inset;
  const maxLeft = bounds ? bounds.right - box.width - inset : viewportWidth - box.width - inset;
  const maxTop = bounds ? bounds.bottom - box.height - inset : viewportHeight - box.height - inset;

  return {
    ...box,
    left: Math.max(minLeft, Math.min(box.left, maxLeft)),
    top: Math.max(minTop, Math.min(box.top, maxTop)),
  };
}

function isValidPlacement(
  candidate: GuideBox,
  targetBox: GuideBox,
  viewportWidth: number,
  viewportHeight: number,
  inset: number,
  bounds: GuideBounds | undefined,
  avoid?: GuideBox,
) {
  const inViewport = fitsViewport(candidate, viewportWidth, viewportHeight, inset);
  const inBounds = bounds ? fitsBounds(candidate, bounds, inset) : true;
  const avoidsTarget = !intersects(candidate, targetBox);
  const avoidsOther = !avoid || !intersects(candidate, avoid);

  return inViewport && inBounds && avoidsTarget && avoidsOther;
}

export function clipRectToViewport(rect: GuideRect, viewportWidth: number, viewportHeight: number, inset = VIEWPORT_INSET): GuideRect | null {
  const left = Math.max(rect.left, inset);
  const top = Math.max(rect.top, inset);
  const right = Math.min(rect.right, viewportWidth - inset);
  const bottom = Math.min(rect.bottom, viewportHeight - inset);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export function isTallGuideTarget(rect: GuideRect, viewportHeight: number) {
  return rect.height > viewportHeight * 0.52;
}

export function resolveGuideBox(
  target: GuideRect,
  placements: GuidePlacement[],
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  options?: {
    avoid?: GuideBox;
    bounds?: GuideBounds;
  },
): GuideBox | null {
  const targetBox = rectToBox(target);
  const inset = viewportWidth < 1024 ? 12 : VIEWPORT_INSET;
  const bounds = options?.bounds;
  const candidates = placements.map((placement) => boxForPlacement(target, placement, width, height));

  const valid = candidates.find((candidate) =>
    isValidPlacement(candidate, targetBox, viewportWidth, viewportHeight, inset, bounds, options?.avoid),
  );

  if (!valid) {
    if (!bounds) {
      return clamp(candidates[0], viewportWidth, viewportHeight, inset);
    }

    const fallback = {
      left: bounds.right - width - inset,
      top: Math.max(bounds.top + inset, target.top),
      width,
      height,
    };

    return clamp(fallback, viewportWidth, viewportHeight, inset, bounds);
  }

  return clamp(valid, viewportWidth, viewportHeight, inset, bounds);
}

export function resolveCenteredClusterLayout(
  bounds: GuideBounds,
  viewportHeight: number,
  dialogWidth: number,
  dialogHeight: number,
  characterWidth: number,
  characterHeight: number,
): { bubble: GuideBox; character: GuideBox } {
  const inset = VIEWPORT_INSET;
  const clusterWidth = characterWidth + GAP + dialogWidth;
  const clusterHeight = Math.max(characterHeight, dialogHeight);
  const visibleTop = bounds.top;
  const visibleBottom = Math.min(bounds.bottom, viewportHeight);
  const visibleHeight = visibleBottom - visibleTop;

  const clusterLeft = bounds.left + Math.max(inset, (bounds.right - bounds.left - clusterWidth) / 2);
  const clusterTop = visibleTop + Math.max(inset, (visibleHeight - clusterHeight) / 2);

  const character: GuideBox = {
    left: clusterLeft,
    top: clusterTop + (clusterHeight - characterHeight) / 2,
    width: characterWidth,
    height: characterHeight,
  };

  const bubble: GuideBox = {
    left: clusterLeft + characterWidth + GAP,
    top: clusterTop + (clusterHeight - dialogHeight) / 2,
    width: dialogWidth,
    height: dialogHeight,
  };

  return { bubble, character };
}

export function resolveTargetAdjacentClusterLayout(
  target: GuideRect,
  viewportWidth: number,
  viewportHeight: number,
  bounds: GuideBounds | undefined,
  dialogWidth: number,
  dialogHeight: number,
  characterWidth: number,
  characterHeight: number,
  options?: {
    anchorY?: "center" | "upper" | "top";
    preferSide?: "left" | "right";
  },
): { bubble: GuideBox; character: GuideBox; characterFacing: "left" | "right" } {
  const inset = VIEWPORT_INSET;
  const anchorY = options?.anchorY ?? "center";
  const preferSide = options?.preferSide ?? "right";
  const minLeft = bounds ? bounds.left + inset : inset;
  const maxRight = bounds ? bounds.right - inset : viewportWidth - inset;
  const contentWidth = maxRight - minLeft;
  const isWideTarget = target.width >= contentWidth * 0.68;

  let anchorCenterY = target.top + target.height / 2;
  if (anchorY === "upper") {
    anchorCenterY = target.top + Math.min(Math.max(target.height * 0.22, 48), 120);
  } else if (anchorY === "top") {
    anchorCenterY = target.top + Math.min(characterHeight / 2 + 16, target.height / 2);
  }

  let characterTop = anchorCenterY - characterHeight / 2;
  characterTop = Math.max(inset, Math.min(characterTop, viewportHeight - characterHeight - inset));

  if (isWideTarget && preferSide === "right") {
    const anchorTop =
      anchorY === "upper"
        ? target.top + Math.min(Math.max(target.height * 0.12, 20), 72)
        : anchorY === "top"
          ? target.top + Math.min(characterHeight / 2 + 12, target.height / 2)
          : target.top + target.height / 2;
    const upperTop = Math.max(inset, Math.min(anchorTop - characterHeight / 2, viewportHeight - characterHeight - inset));
    const characterLeft = Math.max(minLeft, Math.min(target.right + GAP, maxRight - characterWidth - inset));
    const inlineBubbleLeft = characterLeft + characterWidth + GAP;

    if (inlineBubbleLeft + dialogWidth <= maxRight) {
      return {
        character: { left: characterLeft, top: upperTop, width: characterWidth, height: characterHeight },
        bubble: {
          left: inlineBubbleLeft,
          top: Math.max(inset, upperTop + (characterHeight - dialogHeight) / 2),
          width: dialogWidth,
          height: dialogHeight,
        },
        characterFacing: "left",
      };
    }

    const fallbackCharacterLeft = Math.max(minLeft, maxRight - characterWidth - inset);
    return {
      character: { left: fallbackCharacterLeft, top: upperTop, width: characterWidth, height: characterHeight },
      bubble: {
        left: Math.max(minLeft, maxRight - dialogWidth - inset),
        top: Math.min(upperTop + characterHeight + GAP, viewportHeight - dialogHeight - inset),
        width: Math.min(dialogWidth, maxRight - minLeft),
        height: dialogHeight,
      },
      characterFacing: "left",
    };
  }


  const placeRight = () => {
    const characterLeft = Math.min(target.right + GAP, maxRight - characterWidth - GAP - dialogWidth - GAP);
    const bubbleLeft = characterLeft + characterWidth + GAP;
    const bubbleTop = Math.max(inset, Math.min(anchorCenterY - dialogHeight / 2, viewportHeight - dialogHeight - inset));

    return {
      bubble: { left: bubbleLeft, top: bubbleTop, width: dialogWidth, height: dialogHeight },
      character: { left: Math.max(minLeft, characterLeft), top: characterTop, width: characterWidth, height: characterHeight },
      characterFacing: "left" as const,
    };
  };

  const placeLeft = () => {
    const characterLeft = Math.max(minLeft, target.left - GAP - characterWidth);
    const bubbleLeft = Math.max(minLeft, characterLeft - GAP - dialogWidth);
    const bubbleTop = Math.max(inset, Math.min(anchorCenterY - dialogHeight / 2, viewportHeight - dialogHeight - inset));

    return {
      bubble: { left: bubbleLeft, top: bubbleTop, width: dialogWidth, height: dialogHeight },
      character: { left: characterLeft, top: characterTop, width: characterWidth, height: characterHeight },
      characterFacing: "right" as const,
    };
  };

  const placeBelow = () => {
    const clusterWidth = characterWidth + GAP + dialogWidth;
    const clusterLeft = Math.max(minLeft, Math.min(target.left, maxRight - clusterWidth));
    const clusterTop = Math.min(target.bottom + GAP, viewportHeight - Math.max(characterHeight, dialogHeight) - inset);

    return {
      character: {
        left: clusterLeft,
        top: clusterTop,
        width: characterWidth,
        height: characterHeight,
      },
      bubble: {
        left: clusterLeft + characterWidth + GAP,
        top: clusterTop + (characterHeight - dialogHeight) / 2,
        width: dialogWidth,
        height: dialogHeight,
      },
      characterFacing: preferSide === "right" ? ("left" as const) : ("right" as const),
    };
  };

  if (preferSide === "right") {
    const rightLayout = placeRight();
    if (rightLayout.character.left >= minLeft && rightLayout.bubble.left + dialogWidth <= maxRight) {
      return rightLayout;
    }
    return placeBelow();
  }

  const leftLayout = placeLeft();
  if (leftLayout.bubble.left >= minLeft) {
    return leftLayout;
  }

  return placeBelow();
}

export function resolveSidebarAdjacentClusterLayout(
  target: GuideRect,
  sidebarRight: number,
  viewportWidth: number,
  viewportHeight: number,
  dialogWidth: number,
  dialogHeight: number,
  characterWidth: number,
  characterHeight: number,
): { bubble: GuideBox; character: GuideBox; characterFacing: "left" | "right" } {
  const inset = VIEWPORT_INSET;
  const targetCenterY = target.top + target.height / 2;
  const characterLeft = sidebarRight + 12;
  let characterTop = targetCenterY - characterHeight / 2;
  characterTop = Math.max(inset, Math.min(characterTop, viewportHeight - characterHeight - inset));

  const bubbleLeft = characterLeft + characterWidth + GAP;
  const stackedBubbleTop = characterTop + characterHeight + 12;
  const inlineBubbleTop = Math.max(inset, Math.min(targetCenterY - dialogHeight / 2, viewportHeight - dialogHeight - inset));

  if (bubbleLeft + dialogWidth <= viewportWidth - inset) {
    return {
      character: {
        left: characterLeft,
        top: characterTop,
        width: characterWidth,
        height: characterHeight,
      },
      bubble: {
        left: bubbleLeft,
        top: inlineBubbleTop,
        width: dialogWidth,
        height: dialogHeight,
      },
      characterFacing: "left",
    };
  }

  return {
    character: {
      left: characterLeft,
      top: characterTop,
      width: characterWidth,
      height: characterHeight,
    },
    bubble: {
      left: characterLeft,
      top: Math.min(stackedBubbleTop, viewportHeight - dialogHeight - inset),
      width: Math.min(dialogWidth, viewportWidth - characterLeft - inset),
      height: dialogHeight,
    },
    characterFacing: "left",
  };
}

export function isWideGuideTarget(rect: GuideRect, bounds: GuideBounds) {
  return rect.width >= (bounds.right - bounds.left) * 0.58;
}

export function resolveBelowTargetClusterLayout(
  target: GuideRect,
  bounds: GuideBounds,
  viewportHeight: number,
  dialogWidth: number,
  dialogHeight: number,
  characterWidth: number,
  characterHeight: number,
): { bubble: GuideBox; character: GuideBox } {
  const inset = VIEWPORT_INSET;
  const clusterWidth = characterWidth + GAP + dialogWidth;
  const clusterHeight = Math.max(characterHeight, dialogHeight);
  const clusterLeft = bounds.left + Math.max(inset, (bounds.right - bounds.left - clusterWidth) / 2);
  const preferredTop = target.bottom + GAP;
  const clusterTop = Math.max(inset, Math.min(preferredTop, viewportHeight - clusterHeight - inset));

  return {
    character: {
      left: clusterLeft,
      top: clusterTop + (clusterHeight - characterHeight) / 2,
      width: characterWidth,
      height: characterHeight,
    },
    bubble: {
      left: clusterLeft + characterWidth + GAP,
      top: clusterTop + (clusterHeight - dialogHeight) / 2,
      width: dialogWidth,
      height: dialogHeight,
    },
  };
}

export function resolveCharacterFacing(characterBox: GuideBox, target: GuideRect): "left" | "right" {
  const characterCenter = characterBox.left + characterBox.width / 2;
  const targetCenter = target.left + target.width / 2;
  return characterCenter > targetCenter ? "left" : "right";
}
