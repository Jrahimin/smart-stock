"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

import { guideCharacterAssetByPose } from "@/features/guide/character/guide-character-assets";
import type { GuideCharacterPose } from "@/features/guide/types/guide-types";

type GuideCharacterProps = {
  pose: GuideCharacterPose;
  facing?: "left" | "right";
  variant?: "floating" | "inline";
};

export function GuideCharacter({ pose, facing = "right", variant = "floating" }: GuideCharacterProps) {
  const reduceMotion = useReducedMotion();
  const [assetAvailable, setAssetAvailable] = useState(true);
  const shouldFlip =
    (pose === "point-right" && facing === "left") || (pose === "point-left" && facing === "right");

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={`product-guide-character product-guide-character-${variant}${shouldFlip ? " product-guide-character-facing-left" : ""}`}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {assetAvailable ? (
        <Image
          alt=""
          aria-hidden="true"
          className="product-guide-character-art"
          height={variant === "inline" ? 72 : 440}
          onError={() => setAssetAvailable(false)}
          priority={variant === "floating"}
          src={guideCharacterAssetByPose[pose]}
          unoptimized
          width={variant === "inline" ? 72 : 300}
        />
      ) : (
        <div aria-hidden="true" className="product-guide-character-fallback">
          <span>SW</span>
        </div>
      )}
    </motion.div>
  );
}
