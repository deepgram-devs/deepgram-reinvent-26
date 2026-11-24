// Keep the current landscape resolution, but bound portrait copies as well.
export const AURA_COPY_WIDTH = 360;
export const AURA_COPY_MAX_EDGE = 480;
export const AURA_UPLOAD_INTERVAL_MS = 100; // 10 Hz, independent of display refresh

export function auraCopySize(width: number, height: number): { width: number; height: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = Math.min(1, AURA_COPY_WIDTH / w, AURA_COPY_MAX_EDGE / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Coalesce paints without reading pixels or publishing animation state to React.
 *  Record only successful copies. Resizes and stale resumes refresh promptly. */
export class AuraTextureRefresh {
  private revision = -1;
  private width = 0;
  private height = 0;
  private uploadedAt = -Infinity;

  resume(): void {
    this.uploadedAt = -Infinity;
  }

  needsUpload(now: number, revision: number, width: number, height: number): boolean {
    if (revision === 0) return false; // The source has not painted yet.
    const resized = width !== this.width || height !== this.height;
    if (!resized && revision === this.revision) return false;
    return resized || now - this.uploadedAt >= AURA_UPLOAD_INTERVAL_MS;
  }

  didUpload(now: number, revision: number, width: number, height: number): void {
    this.uploadedAt = now;
    this.revision = revision;
    this.width = width;
    this.height = height;
  }
}
