import { useEffect, useRef } from 'preact/hooks';

interface BackgroundProps {
  energy: number;
  playing: boolean;
}

interface NodePoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

export function SignalBackground({ energy, playing }: BackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const energyRef = useRef(energy);
  const playingRef = useRef(playing);

  useEffect(() => {
    energyRef.current = energy;
    playingRef.current = playing;
  }, [energy, playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const context = canvas.getContext('2d', { alpha: false });
    if (context === null) {
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const lowPower = navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4;
    const nodes: NodePoint[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let animation = 0;
    let lastTime = 0;
    let hidden = document.hidden;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const divisor = lowPower ? 38_000 : 24_000;
      const count = reducedMotion.matches ? 18 : Math.max(24, Math.min(70, Math.round(width * height / divisor)));
      while (nodes.length < count) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 7,
          vy: (Math.random() - 0.5) * 7,
          phase: Math.random() * Math.PI * 2,
        });
      }
      nodes.length = count;
    };

    const draw = (time: number) => {
      animation = requestAnimationFrame(draw);
      if (hidden || (time - lastTime < (lowPower ? 32 : 15))) {
        return;
      }
      const elapsed = Math.min(0.05, (time - lastTime) / 1000 || 0.016);
      lastTime = time;
      frame += elapsed;
      const activeEnergy = playingRef.current ? energyRef.current : 0;

      context.fillStyle = '#080b0d';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = `rgba(52, 206, 196, ${0.055 + activeEnergy * 0.09})`;
      context.lineWidth = 0.75;
      const linkDistance = lowPower ? 125 : 155;
      for (let first = 0; first < nodes.length; first += 1) {
        const point = nodes[first];
        if (!reducedMotion.matches) {
          point.x += point.vx * elapsed * (1 + activeEnergy * 1.5);
          point.y += point.vy * elapsed * (1 + activeEnergy * 1.5);
          if (point.x < -10) point.x = width + 10;
          if (point.x > width + 10) point.x = -10;
          if (point.y < -10) point.y = height + 10;
          if (point.y > height + 10) point.y = -10;
        }
        for (let second = first + 1; second < nodes.length; second += 1) {
          const other = nodes[second];
          const dx = point.x - other.x;
          const dy = point.y - other.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < linkDistance * linkDistance) {
            context.globalAlpha = 1 - Math.sqrt(distanceSquared) / linkDistance;
            context.beginPath();
            context.moveTo(point.x, point.y);
            context.lineTo(other.x, other.y);
            context.stroke();
          }
        }
      }
      context.globalAlpha = 1;
      for (const point of nodes) {
        const pulse = 0.55 + Math.sin(frame * 1.4 + point.phase) * 0.25 + activeEnergy * 0.75;
        context.fillStyle = `rgba(108, 231, 211, ${Math.min(0.58, pulse * 0.34)})`;
        context.beginPath();
        context.arc(point.x, point.y, 1 + pulse * 0.65, 0, Math.PI * 2);
        context.fill();
      }

      const centerY = height * 0.72;
      context.strokeStyle = `rgba(239, 174, 78, ${0.04 + activeEnergy * 0.18})`;
      context.lineWidth = 1;
      context.beginPath();
      for (let x = 0; x <= width; x += 8) {
        const envelope = Math.sin((x / Math.max(1, width)) * Math.PI);
        const y = centerY + Math.sin(x * 0.025 + frame * 1.8) * envelope * (5 + activeEnergy * 26);
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    };

    const visibility = () => {
      hidden = document.hidden;
      if (!hidden) {
        lastTime = performance.now();
      }
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    reducedMotion.addEventListener('change', resize);
    animation = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      reducedMotion.removeEventListener('change', resize);
    };
  }, []);

  return <canvas ref={canvasRef} class="signal-background" aria-hidden="true" />;
}
