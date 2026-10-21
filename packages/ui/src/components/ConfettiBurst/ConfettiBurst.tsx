import { useEffect, useRef } from "react";
import "./ConfettiBurst.css";

export interface ConfettiBurstProps {
  active: boolean;
  /** Defaults to the theme's accent and secondary colors (from the CSS variables), plus white. */
  colors?: string[];
  particleCount?: number;
  /**
   * Keep it falling while `active`: the first burst, then a steady, gentler
   * fall (half as many pieces after SETTLE_MS). For the end-of-night screen.
   * Without it, one burst that fades after a few seconds.
   */
  continuous?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vr: number;
  color: string;
  size: number;
  life: number;
}

const FALLBACK_COLORS = ["#ebc81e", "#4dd0e1", "#ff6b6b", "#81c784", "#f4f6ff"];
const MAX_LIFE_FRAMES = 240;
/** How long a continuous fall keeps its first burst's density. */
export const SETTLE_MS = 15_000;

/** The theme's colors where the canvas sits, with white, or a fixed set outside a theme. */
function themeColors(element: HTMLElement): string[] {
  const style = getComputedStyle(element);
  const theme = ["--color-accent", "--color-secondary"].map((v) => style.getPropertyValue(v).trim()).filter(Boolean);
  return theme.length ? [...theme, "#f4f6ff"] : FALLBACK_COLORS;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * Real canvas-based particle system -- replaces legacy's unused
 * <canvas id="fireworks-canvas"> (nothing ever drew to it) plus its
 * separate DOM-node-per-particle confetti implementation, unified here as
 * one shared primitive used by both AskMeOverlay and GrandCelebrationOverlay.
 */
export function ConfettiBurst({ active, colors, particleCount = 120, continuous = false }: ConfettiBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const palette = colors ?? themeColors(canvas);
    const startedAt = performance.now();

    function resize() {
      canvas!.width = canvas!.clientWidth;
      canvas!.height = canvas!.clientHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const spawn = (spread: number): Particle => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * spread,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      rotation: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10,
      color: palette[Math.floor(Math.random() * palette.length)] ?? FALLBACK_COLORS[0]!,
      size: 6 + Math.random() * 6,
      life: 0,
    });
    particlesRef.current = Array.from({ length: particleCount }, () => spawn(0.3));

    function tick() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let anyAlive = false;
      // A continuous fall recycles pieces that leave the screen, thinning out once it settles.
      const keep = performance.now() - startedAt < SETTLE_MS ? particleCount : Math.ceil(particleCount / 2);
      for (const [index, p] of particlesRef.current.entries()) {
        if (continuous && p.y > canvas.height + 20 && index < keep) Object.assign(p, spawn(0.05));
        if (continuous ? p.y > canvas.height + 20 : p.life > MAX_LIFE_FRAMES) continue;
        anyAlive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vr;
        p.life += 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = continuous ? 1 : Math.max(0, 1 - p.life / MAX_LIFE_FRAMES);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (anyAlive || continuous) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, colors, particleCount, continuous]);

  return <canvas ref={canvasRef} className="confetti-burst" aria-hidden="true" />;
}
