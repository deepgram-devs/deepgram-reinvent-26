import { Lattice, type LatticeState, type Ramp2 } from "../lib/lattice";
import { OrbClusterRenderer } from "../lib/orbClusterRenderer";

type PublicRingState = Exclude<LatticeState, "hidden">;
const RING_STATES = new Set<PublicRingState>(["listening", "thinking", "speaking", "settling"]);
const DEFAULT_MAX_SIZE = 560;

export interface VoiceRingElement extends HTMLElement {
  level: number;
  palette: Ramp2;
}

declare global {
  interface HTMLElementTagNameMap {
    "deepgram-voice-ring": VoiceRingElement;
  }
}

/** Register the standalone ring custom element used by non-React hosts such as Elm. */
export function defineVoiceRingElement(tagName = "deepgram-voice-ring"): void {
  if (typeof customElements === "undefined" || customElements.get(tagName)) return;

  class VoiceRingElementImpl extends HTMLElement implements VoiceRingElement {
    static observedAttributes = ["active", "state", "sky", "mid", "visible", "max-size"];

    private mount: HTMLDivElement | null = null;
    private lattice: Lattice | null = null;
    private renderer: OrbClusterRenderer | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private motion: MediaQueryList | null = null;
    private frame = 0;
    private loopGeneration = 0;
    private lastFrameAt = 0;
    private currentLevel = 0;
    private appliedState: PublicRingState | null = null;

    connectedCallback(): void {
      this.upgradeProperty("level");
      this.upgradeProperty("palette");
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      if (!this.mount) {
        this.mount = document.createElement("div");
        this.mount.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none";
        this.shadowRoot?.append(this.mount);
      }
      this.style.display ||= "block";
      this.style.position ||= "relative";

      this.lattice = new Lattice(false);
      this.lattice.onSettled = () => {
        this.dispatchEvent(new CustomEvent("settled", { bubbles: true, composed: true }));
      };
      this.motion = typeof matchMedia === "function"
        ? matchMedia("(prefers-reduced-motion: reduce)")
        : null;
      this.motion?.addEventListener("change", this.handleMotionChange);
      this.handleMotionChange();

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.mount);
      this.appliedState = null;
      this.syncAttributes();
    }

    disconnectedCallback(): void {
      this.stopLoop();
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.motion?.removeEventListener("change", this.handleMotionChange);
      this.motion = null;
      this.renderer?.dispose();
      this.renderer = null;
      if (this.lattice) this.lattice.onSettled = null;
      this.lattice = null;
      this.appliedState = null;
    }

    attributeChangedCallback(): void {
      this.syncAttributes();
    }

    get level(): number {
      return this.currentLevel;
    }

    set level(value: number) {
      this.currentLevel = Math.min(1, Math.max(0, Number(value) || 0));
    }

    get palette(): Ramp2 {
      return {
        sky: this.getAttribute("sky") ?? "#F7F2EA",
        mid: this.getAttribute("mid") ?? "#A855F7",
      };
    }

    set palette(value: Ramp2) {
      this.setAttribute("sky", value.sky);
      this.setAttribute("mid", value.mid);
    }

    // A host that sets a property before defineVoiceRingElement() runs (lazy loading)
    // leaves an own property that would shadow the accessor forever; move it through it.
    private upgradeProperty(key: "level" | "palette"): void {
      if (!Object.hasOwn(this, key)) return;
      const value: unknown = Reflect.get(this, key);
      Reflect.deleteProperty(this, key);
      Reflect.set(this, key, value);
    }

    private readonly handleMotionChange = (): void => {
      this.lattice?.setReducedMotion(this.motion?.matches ?? false);
    };

    private booleanAttribute(name: string, fallback: boolean): boolean {
      const value = this.getAttribute(name);
      return value === null ? fallback : value !== "false";
    }

    private requestedState(): PublicRingState {
      const state = this.getAttribute("state") as PublicRingState | null;
      return state && RING_STATES.has(state) ? state : "listening";
    }

    private syncAttributes(): void {
      const lattice = this.lattice;
      if (!lattice || !this.mount) return;

      lattice.setRamp(this.palette);
      const state = this.requestedState();
      if (state !== this.appliedState) {
        if (state === "settling") {
          lattice.settle();
        } else {
          if (lattice.currentState() === "settling" || lattice.isHidden()) {
            lattice.reset();
            lattice.setRamp(this.palette);
          }
          lattice.setState(state);
        }
        this.appliedState = state;
      }

      if (this.booleanAttribute("active", true)) {
        this.renderer ??= new OrbClusterRenderer(this.mount, lattice, {
          auraTextureEnabled: false,
        });
        this.resize();
      } else {
        this.renderer?.dispose();
        this.renderer = null;
      }

      if (this.renderer && this.booleanAttribute("visible", true)) this.startLoop();
      else this.stopLoop();
    }

    private resize(): void {
      const lattice = this.lattice;
      const renderer = this.renderer;
      const mount = this.mount;
      if (!lattice || !renderer || !mount) return;
      const { width, height } = mount.getBoundingClientRect();
      const requestedMax = Number(this.getAttribute("max-size"));
      const maxSize = Number.isFinite(requestedMax) && requestedMax > 0
        ? requestedMax
        : DEFAULT_MAX_SIZE;
      lattice.setFrame({
        cx: width / 2,
        cy: height / 2,
        w: Math.max(0, Math.min(maxSize, width / 0.9, height / 0.9)),
        target: this.requestedState() === "settling"
          ? { x: width / 2, y: height / 2, r: 0 }
          : undefined,
      });
      renderer.resize(width, height);
    }

    private startLoop(): void {
      if (this.frame) return;
      const generation = ++this.loopGeneration;
      this.lastFrameAt = performance.now();
      this.renderer?.resume();
      this.scheduleNext(generation);
    }

    private stopLoop(): void {
      this.loopGeneration++;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }

    private scheduleNext(generation: number): void {
      this.frame = requestAnimationFrame(now => this.tick(now, generation));
    }

    private tick(now: number, generation: number): void {
      if (generation !== this.loopGeneration) return;
      const lattice = this.lattice;
      const renderer = this.renderer;
      if (!lattice || !renderer) {
        this.frame = 0;
        return;
      }
      const delta = Math.min(0.05, Math.max(0, (now - this.lastFrameAt) / 1000));
      this.lastFrameAt = now;
      lattice.pushLevel(this.currentLevel, delta);
      renderer.render(delta);
      if (
        generation !== this.loopGeneration
        || this.lattice !== lattice
        || this.renderer !== renderer
        || !this.isConnected
        || !this.booleanAttribute("active", true)
        || !this.booleanAttribute("visible", true)
      ) {
        if (generation === this.loopGeneration) this.frame = 0;
        return;
      }
      this.scheduleNext(generation);
    }
  }

  customElements.define(tagName, VoiceRingElementImpl);
}
