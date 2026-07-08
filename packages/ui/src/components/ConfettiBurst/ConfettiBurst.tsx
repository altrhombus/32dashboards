import { useEffect, useRef } from "react";
import "./ConfettiBurst.css";

export interface ConfettiBurstProps {
  active: boolean;
  colors?: string[];
  particleCount?: number;
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

const DEFAULT_COLORS = ["#ffd700", "#4dd0e1", "#ff6b6b", "#81c784", "#f4f6ff"];
const MAX_LIFE_FRAMES = 240;

/**
 * Real canvas-based particle system -- replaces legacy's unused
 * <canvas id="fireworks-canvas"> (nothing ever drew to it) plus its
 * separate DOM-node-per-particle confetti implementation, unified here as
 * one shared primitive used by both AskMeOverlay and GrandCelebrationOverlay.
 */
export function ConfettiBurst({ active, colors = DEFAULT_COLORS, particleCount = 120 }: ConfettiBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    function resize() {
      canvas!.width = canvas!.clientWidth;
      canvas!.height = canvas!.clientHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      rotation: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10,
      color: colors[Math.floor(Math.random() * colors.length)] ?? "#ffd700",
      size: 6 + Math.random() * 6,
      life: 0,
    }));

    function tick() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let anyAlive = false;
      for (const p of particlesRef.current) {
        if (p.life > MAX_LIFE_FRAMES) continue;
        anyAlive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vr;
        p.life += 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - p.life / MAX_LIFE_FRAMES);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (anyAlive) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, colors, particleCount]);

  return <canvas ref={canvasRef} className="confetti-burst" aria-hidden="true" />;
}
