"use client";

import { createContext, type ReactNode, useContext } from "react";

/**
 * What the voice session sits on, which sets how its panel and dock look:
 *
 *   glass  — frosted, over the stage texture during the call (StageLayout sets this)
 *   violet — solid violet, beside the paper record (RecordLayout sets this, and it's the default)
 *
 * The layouts set it for you. An app with its own record screen wraps its panel in
 * <SessionSurfaceProvider surface="violet">, or passes surface to the panel.
 */
export type SessionSurface = "glass" | "violet";

const SurfaceContext = createContext<SessionSurface>("violet");

export function SessionSurfaceProvider({ surface, children }: { surface: SessionSurface; children: ReactNode }) {
  return <SurfaceContext.Provider value={surface}>{children}</SurfaceContext.Provider>;
}

/** The surface around this component, or `override` when it's given */
export function useSessionSurface(override?: SessionSurface): SessionSurface {
  const surface = useContext(SurfaceContext);
  return override ?? surface;
}
