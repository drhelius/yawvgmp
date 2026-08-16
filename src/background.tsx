import { useEffect, useRef } from 'preact/hooks';

interface BackgroundProps {
  energy: number;
  playing: boolean;
}

interface FlowParticle {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  speed: number;
  age: number;
  lifetime: number;
  color: number;
}

const COLORS = ['96, 220, 203', '143, 216, 107', '237, 174, 78'];

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
    const trails = document.createElement('canvas');
    const trailContext = trails.getContext('2d');
    if (trailContext === null) {
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const lowPower = navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4;
    const particles: FlowParticle[] = [];
    let width = 0;
    let height = 0;
    let animation = 0;
    let lastTime = 0;
    let hidden = document.hidden;

    const resetParticle = (particle: FlowParticle, initial: boolean) => {
      const bandCenter = height * 0.58;
      const bandHeight = Math.min(260, Math.max(120, height * 0.38));
      particle.x = initial ? Math.random() * width : -30;
      particle.y = bandCenter + (Math.random() - 0.5) * bandHeight;
      particle.previousX = particle.x - 1;
      particle.previousY = particle.y;
      particle.velocityX = 0.8;
      particle.velocityY = 0;
      particle.speed = 10 + Math.random() * 17;
      particle.age = initial ? Math.random() * 18 : 0;
      particle.lifetime = 22 + Math.random() * 30;
      particle.color = Math.floor(Math.random() * COLORS.length);
    };

    const clearTrails = () => {
      trailContext.save();
      trailContext.setTransform(1, 0, 0, 1, 0, 0);
      trailContext.clearRect(0, 0, trails.width, trails.height);
      trailContext.restore();
    };

    const compose = (activeEnergy: number) => {
      context.fillStyle = '#080b0d';
      context.fillRect(0, 0, width, height);
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = 0.28 + activeEnergy * 0.14;
      context.filter = lowPower ? 'blur(7px)' : 'blur(11px)';
      context.drawImage(trails, 0, 0, width, height);
      if (!lowPower) {
        context.globalAlpha = 0.12 + activeEnergy * 0.08;
        context.filter = 'blur(22px)';
        context.drawImage(trails, 0, 0, width, height);
      }
      context.globalAlpha = 0.72;
      context.filter = 'none';
      context.drawImage(trails, 0, 0, width, height);
      context.restore();
    };

    const advance = (elapsed: number, time: number, activeEnergy: number) => {
      trailContext.save();
      trailContext.globalCompositeOperation = 'destination-out';
      trailContext.fillStyle = `rgba(0, 0, 0, ${Math.min(0.13, elapsed * 3.2)})`;
      trailContext.fillRect(0, 0, width, height);
      trailContext.restore();
      trailContext.lineCap = 'round';
      trailContext.lineWidth = 0.65 + activeEnergy * 0.55;

      const flowTime = time * 0.000035;
      for (const particle of particles) {
        particle.previousX = particle.x;
        particle.previousY = particle.y;
        const angle =
          Math.sin(particle.x * 0.0032 + flowTime * 1.4) * 1.15 +
          Math.cos(particle.y * 0.0045 - flowTime) * 0.9 +
          Math.sin((particle.x + particle.y) * 0.0016 + flowTime * 0.7) * 0.55;
        const response = Math.min(1, elapsed * 2.8);
        const targetX = 0.72 + Math.cos(angle) * 0.62;
        const targetY = Math.sin(angle) * 0.78;
        particle.velocityX += (targetX - particle.velocityX) * response;
        particle.velocityY += (targetY - particle.velocityY) * response;
        const playbackBoost = 1 + activeEnergy * 0.55;
        particle.x += particle.velocityX * particle.speed * elapsed * playbackBoost;
        particle.y += particle.velocityY * particle.speed * elapsed * playbackBoost;
        particle.age += elapsed;

        const lifeFade = Math.min(1, particle.age * 0.45) * Math.min(1, (particle.lifetime - particle.age) * 0.3);
        trailContext.strokeStyle = `rgba(${COLORS[particle.color]}, ${0.19 * Math.max(0, lifeFade)})`;
        trailContext.beginPath();
        trailContext.moveTo(particle.previousX, particle.previousY);
        trailContext.lineTo(particle.x, particle.y);
        trailContext.stroke();

        if (particle.age >= particle.lifetime || particle.x > width + 40 || particle.y < -40 || particle.y > height + 40) {
          resetParticle(particle, false);
        }
      }
    };

    const drawStatic = () => {
      clearTrails();
      for (let step = 0; step < 100; step += 1) {
        advance(0.04, step * 40, 0);
      }
      compose(0);
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      trails.width = canvas.width;
      trails.height = canvas.height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      trailContext.setTransform(ratio, 0, 0, ratio, 0, 0);

      const areaCount = Math.round(width * height / (lowPower ? 8_000 : 5_000));
      const count = reducedMotion.matches ? 55 : Math.max(90, Math.min(lowPower ? 180 : 300, areaCount));
      while (particles.length < count) {
        particles.push({
          x: 0,
          y: 0,
          previousX: 0,
          previousY: 0,
          velocityX: 0,
          velocityY: 0,
          speed: 0,
          age: 0,
          lifetime: 0,
          color: 0,
        });
      }
      particles.length = count;
      for (const particle of particles) {
        resetParticle(particle, true);
      }
      clearTrails();
      if (reducedMotion.matches) {
        drawStatic();
      }
    };

    const draw = (time: number) => {
      animation = requestAnimationFrame(draw);
      if (hidden || reducedMotion.matches || time - lastTime < (lowPower ? 32 : 15)) {
        return;
      }
      const elapsed = Math.min(0.05, (time - lastTime) / 1000 || 0.016);
      lastTime = time;
      const activeEnergy = playingRef.current ? energyRef.current : 0;
      advance(elapsed, time, activeEnergy);
      compose(activeEnergy);
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
