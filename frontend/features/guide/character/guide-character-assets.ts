import type { GuideCharacterPose } from "@/features/guide/types/guide-types";

export const guideCharacterAssetByPose: Record<GuideCharacterPose, string> = {
  welcome: "/maskot/welcome.png",
  "point-left": "/maskot/point-left.png",
  "point-right": "/maskot/point-right.png",
  thinking: "/maskot/thinking.png",
  farewell: "/maskot/farewell.png",
};
