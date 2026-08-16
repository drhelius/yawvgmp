import SimplexNoise from 'simplex-noise';
import { useEffect, useRef } from 'preact/hooks';

const PARTICLE_COUNT = 700;
const PARTICLE_PROP_COUNT = 9;
const RANGE_Y = 100;
const BASE_TTL = 50;
const RANGE_TTL = 150;
const BASE_SPEED = 0.1;
const RANGE_SPEED = 2;
const BASE_RADIUS = 1;
const RANGE_RADIUS = 4;
const BASE_HUE = 92;
const RANGE_HUE = 82;
const NOISE_STEPS = 8;
const X_OFFSET = 0.00125;
const Y_OFFSET = 0.00125;
const Z_OFFSET = 0.0005;
const SPEED_SCALE = 0.72;
const BACKGROUND_COLOR = 'hsla(195, 24%, 4%, 1)';
const TAU = Math.PI * 2;

function random(maximum: number): number {
  return maximum * Math.random();
}

function randomRange(range: number): number {
  return range - random(2 * range);
}

function lerp(first: number, second: number, speed: number): number {
  return (1 - speed) * first + speed * second;
}

function fadeInOut(time: number, maximum: number): number {
  const half = 0.5 * maximum;
  return Math.abs((time + half) % maximum - half) / half;
}

export function SignalBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const screenCanvas = canvasRef.current;
    if (screenCanvas === null) {
      return;
    }
    const particleCanvas = document.createElement('canvas');
    const particleContext = particleCanvas.getContext('2d');
    const screenContext = screenCanvas.getContext('2d', { alpha: false });
    if (particleContext === null || screenContext === null) {
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const lowPower = navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4;
    const simplex = new SimplexNoise();
    let particleProperties = new Float32Array(PARTICLE_COUNT * PARTICLE_PROP_COUNT);
    let width = 0;
    let height = 0;
    let centerY = 0;
    let tick = 0;
    let animation = 0;
    let lastFrame = 0;
    let hidden = document.hidden;

    const initializeParticle = (offset: number) => {
      const x = random(width);
      const y = centerY + randomRange(RANGE_Y);
      const lifetime = BASE_TTL + random(RANGE_TTL);
      const speed = (BASE_SPEED + random(RANGE_SPEED)) * SPEED_SCALE;
      const radius = BASE_RADIUS + random(RANGE_RADIUS);
      const hue = BASE_HUE + random(RANGE_HUE);
      particleProperties.set([x, y, 0, 0, 0, lifetime, speed, radius, hue], offset);
    };

    const initializeParticles = () => {
      tick = 0;
      const particleCount = reducedMotion.matches ? 160 : (lowPower ? 420 : PARTICLE_COUNT);
      particleProperties = new Float32Array(particleCount * PARTICLE_PROP_COUNT);
      for (let offset = 0; offset < particleProperties.length; offset += PARTICLE_PROP_COUNT) {
        initializeParticle(offset);
      }
    };

    const outOfBounds = (x: number, y: number): boolean => (
      x > width || x < 0 || y > height || y < 0
    );

    const drawParticle = (
      x: number,
      y: number,
      nextX: number,
      nextY: number,
      life: number,
      lifetime: number,
      radius: number,
      hue: number,
    ) => {
      particleContext.save();
      particleContext.lineCap = 'round';
      particleContext.lineWidth = radius;
      particleContext.strokeStyle = `hsla(${hue}, 100%, 60%, ${fadeInOut(life, lifetime)})`;
      particleContext.beginPath();
      particleContext.moveTo(x, y);
      particleContext.lineTo(nextX, nextY);
      particleContext.stroke();
      particleContext.closePath();
      particleContext.restore();
    };

    const updateParticle = (offset: number) => {
      const xIndex = offset;
      const yIndex = offset + 1;
      const velocityXIndex = offset + 2;
      const velocityYIndex = offset + 3;
      const lifeIndex = offset + 4;
      const lifetimeIndex = offset + 5;
      const speedIndex = offset + 6;
      const radiusIndex = offset + 7;
      const hueIndex = offset + 8;
      const x = particleProperties[xIndex];
      const y = particleProperties[yIndex];
      const noise = simplex.noise3D(x * X_OFFSET, y * Y_OFFSET, tick * Z_OFFSET) * NOISE_STEPS * TAU;
      const velocityX = lerp(particleProperties[velocityXIndex], Math.cos(noise), 0.5);
      const velocityY = lerp(particleProperties[velocityYIndex], Math.sin(noise), 0.5);
      const life = particleProperties[lifeIndex];
      const lifetime = particleProperties[lifetimeIndex];
      const speed = particleProperties[speedIndex];
      const nextX = x + velocityX * speed;
      const nextY = y + velocityY * speed;

      drawParticle(
        x,
        y,
        nextX,
        nextY,
        life,
        lifetime,
        particleProperties[radiusIndex],
        particleProperties[hueIndex],
      );

      particleProperties[xIndex] = nextX;
      particleProperties[yIndex] = nextY;
      particleProperties[velocityXIndex] = velocityX;
      particleProperties[velocityYIndex] = velocityY;
      particleProperties[lifeIndex] = life + 1;

      if (outOfBounds(x, y) || life > lifetime) {
        initializeParticle(offset);
      }
    };

    const drawParticles = () => {
      for (let offset = 0; offset < particleProperties.length; offset += PARTICLE_PROP_COUNT) {
        updateParticle(offset);
      }
    };

    const renderGlow = () => {
      screenContext.save();
      screenContext.filter = 'blur(8px) brightness(200%)';
      screenContext.globalCompositeOperation = 'lighter';
      screenContext.drawImage(particleCanvas, 0, 0, width, height);
      screenContext.restore();

      screenContext.save();
      screenContext.filter = 'blur(4px) brightness(200%)';
      screenContext.globalCompositeOperation = 'lighter';
      screenContext.drawImage(particleCanvas, 0, 0, width, height);
      screenContext.restore();
    };

    const renderToScreen = () => {
      screenContext.save();
      screenContext.globalCompositeOperation = 'lighter';
      screenContext.drawImage(particleCanvas, 0, 0, width, height);
      screenContext.restore();
    };

    const renderFrame = () => {
      tick += SPEED_SCALE;
      particleContext.clearRect(0, 0, width, height);
      screenContext.fillStyle = BACKGROUND_COLOR;
      screenContext.fillRect(0, 0, width, height);
      drawParticles();
      renderGlow();
      renderToScreen();
    };

    const draw = (time: number) => {
      animation = requestAnimationFrame(draw);
      if (hidden || reducedMotion.matches || time - lastFrame < 16) {
        return;
      }
      lastFrame = time;
      renderFrame();
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      centerY = 0.5 * height;
      particleCanvas.width = Math.round(width * ratio);
      particleCanvas.height = Math.round(height * ratio);
      screenCanvas.width = particleCanvas.width;
      screenCanvas.height = particleCanvas.height;
      screenCanvas.style.width = `${width}px`;
      screenCanvas.style.height = `${height}px`;
      particleContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      screenContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      initializeParticles();
      renderFrame();
    };

    const visibility = () => {
      hidden = document.hidden;
      if (!hidden) {
        lastFrame = performance.now();
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
