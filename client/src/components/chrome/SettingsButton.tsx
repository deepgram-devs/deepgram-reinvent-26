"use client";

import { SettingsButton as KitSettingsButton } from "@deepgram-devs/dg-brand-ui";

import { useSettings } from "@/lib/settings";

/** Opens About this app. "solid" on the claim review's top bar, "glass" over the dark screens. */
export function SettingsButton({ tone = "glass" }: { tone?: "solid" | "glass" }) {
  const { open, show } = useSettings();
  return <KitSettingsButton tone={tone} open={open} onClick={show} />;
}
