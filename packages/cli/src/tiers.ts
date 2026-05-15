export type InstallTierId = "image" | "image-gpu";

export interface RuntimeTierStatus {
  label: string;
  ready: boolean;
  installHint: string | null;
  tracker?: string;
}

export interface InstallTierPlan {
  tier: InstallTierId;
  label: string;
  runtimeTier: "tier1" | "tier2";
  decoderManifestRequired: true;
  weightsRequired: true;
  allowResearchWeights: boolean;
  tracker: string;
  blockedBy: "decoder-manifest";
}

const IMAGE_INSTALL_TRACKER = "https://github.com/p-to-q/wittgenstein/issues/403";

export function runtimeTierReadiness(): Record<
  "tier0" | "tier1" | "tier2" | "tier3",
  RuntimeTierStatus
> {
  return {
    tier0: {
      label: "sensor / svg-local / asciipng",
      ready: true,
      installHint: null,
    },
    tier1: {
      label: "image CPU decoder bridge",
      ready: false,
      installHint: "wittgenstein install image",
      tracker: IMAGE_INSTALL_TRACKER,
    },
    tier2: {
      label: "image GPU decoder bridge",
      ready: false,
      installHint: "wittgenstein install image --gpu",
      tracker: IMAGE_INSTALL_TRACKER,
    },
    tier3: {
      label: "research / training",
      ready: false,
      installHint: "git checkout + repo docs; not a user install tier",
    },
  };
}

export function resolveInstallTier(
  tier: string,
  options: { gpu?: boolean } = {},
): InstallTierId | null {
  if (tier === "image") {
    return options.gpu ? "image-gpu" : "image";
  }

  if (tier === "image-gpu") {
    return "image-gpu";
  }

  return null;
}

export function buildInstallTierPlan(
  tier: InstallTierId,
  options: { allowResearchWeights?: boolean } = {},
): InstallTierPlan {
  const runtimeTier = tier === "image-gpu" ? "tier2" : "tier1";
  const readiness = runtimeTierReadiness()[runtimeTier];

  return {
    tier,
    label: readiness.label,
    runtimeTier,
    decoderManifestRequired: true,
    weightsRequired: true,
    allowResearchWeights: options.allowResearchWeights ?? false,
    tracker: IMAGE_INSTALL_TRACKER,
    blockedBy: "decoder-manifest",
  };
}
