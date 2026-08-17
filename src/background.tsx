import SimplexNoise from 'simplex-noise';
import { useEffect, useRef } from 'preact/hooks';
import type { AudioEngine } from './audio-engine';

const PARTICLE_COUNT = 700;
const PARTICLE_PROP_COUNT = 11;
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
const IMPULSE_DECAY = 0.72;
const PEAK_COOLDOWN = 80;
const IMPULSE_VELOCITY = 2.5;

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

interface SignalBackgroundProps {
  audioEngine: AudioEngine | null;
}

export function SignalBackground({ audioEngine }: SignalBackgroundProps) {
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
    let lastPeak = 0;
    let hidden = document.hidden;
    let audioLevelsReady = false;
    let previousLow = 0;
    let previousHigh = 0;
    let lowMaximum = 0.000001;
    let midMaximum = 0.000001;
    let highMaximum = 0.000001;
    let lowLevel = 0;
    let midLevel = 0;
    let highLevel = 0;
    let colorPulse = 0;

    const initializeParticle = (offset: number) => {
      const x = random(width);
      const y = centerY + randomRange(RANGE_Y);
      const lifetime = BASE_TTL + random(RANGE_TTL);
      const speed = (BASE_SPEED + random(RANGE_SPEED)) * SPEED_SCALE;
      const radius = BASE_RADIUS + random(RANGE_RADIUS);
      const hue = BASE_HUE + random(RANGE_HUE);
      particleProperties.set([x, y, 0, 0, 0, lifetime, speed, radius, hue, 0, 0], offset);
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
      impulse: number,
      bandLevel: number,
    ) => {
      particleContext.save();
      particleContext.lineCap = 'round';
      particleContext.lineWidth = radius * (1 + impulse * 0.18 + bandLevel * 0.22);
      particleContext.strokeStyle = `hsla(${hue + colorPulse * 22}, 100%, ${60 + colorPulse * 12}%, ${fadeInOut(life, lifetime)})`;
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
      const impulseIndex = offset + 9;
      const impulseDirectionIndex = offset + 10;
      const x = particleProperties[xIndex];
      const y = particleProperties[yIndex];
      const noise = simplex.noise3D(x * X_OFFSET, y * Y_OFFSET, tick * Z_OFFSET) * NOISE_STEPS * TAU;
      const velocityX = lerp(particleProperties[velocityXIndex], Math.cos(noise), 0.5);
      const velocityY = lerp(particleProperties[velocityYIndex], Math.sin(noise), 0.5);
      const life = particleProperties[lifeIndex];
      const lifetime = particleProperties[lifetimeIndex];
      const speed = particleProperties[speedIndex];
      const impulse = particleProperties[impulseIndex];
      const impulseDirection = particleProperties[impulseDirectionIndex];
      const impulseVelocityX = Math.cos(impulseDirection) * impulse * IMPULSE_VELOCITY;
      const impulseVelocityY = Math.sin(impulseDirection) * impulse * IMPULSE_VELOCITY;
      const particleIndex = offset / PARTICLE_PROP_COUNT;
      const bandLevel = particleIndex % 3 === 0 ? lowLevel : (particleIndex % 3 === 1 ? midLevel : highLevel);
      const musicSpeed = 1 + lowLevel * 0.35 + bandLevel * 0.85;
      const nextX = x + (velocityX + impulseVelocityX) * speed * musicSpeed;
      const nextY = y + (velocityY + impulseVelocityY) * speed * musicSpeed;

      drawParticle(
        x,
        y,
        nextX,
        nextY,
        life,
        lifetime,
        particleProperties[radiusIndex],
        particleProperties[hueIndex],
        impulse,
        bandLevel,
      );

      particleProperties[xIndex] = nextX;
      particleProperties[yIndex] = nextY;
      particleProperties[velocityXIndex] = velocityX;
      particleProperties[velocityYIndex] = velocityY;
      particleProperties[lifeIndex] = life + 1;
      particleProperties[impulseIndex] = impulse * IMPULSE_DECAY;

      if (outOfBounds(x, y) || life > lifetime) {
        initializeParticle(offset);
      }
    };

    const drawParticles = () => {
      for (let offset = 0; offset < particleProperties.length; offset += PARTICLE_PROP_COUNT) {
        updateParticle(offset);
      }
    };

    const triggerImpulse = (strength: number, highFrequency: boolean) => {
      for (let offset = 0; offset < particleProperties.length; offset += PARTICLE_PROP_COUNT) {
        if (highFrequency && Math.random() > 0.45) {
          continue;
        }
        particleProperties[offset + 9] = strength * (0.45 + random(0.55));
        particleProperties[offset + 10] = random(TAU);
      }
    };

    const updateMusicImpulse = (time: number) => {
      if (audioEngine === null) {
        lowLevel = lerp(lowLevel, 0, 0.3);
        midLevel = lerp(midLevel, 0, 0.3);
        highLevel = lerp(highLevel, 0, 0.3);
        colorPulse *= IMPULSE_DECAY;
        return;
      }

      const levels = audioEngine.getAudioLevels();
      if (levels.low < 0.000001 && levels.mid < 0.000001 && levels.high < 0.000001) {
        audioLevelsReady = false;
        previousLow = 0;
        previousHigh = 0;
        lowMaximum = 0.000001;
        midMaximum = 0.000001;
        highMaximum = 0.000001;
        lowLevel = lerp(lowLevel, 0, 0.3);
        midLevel = lerp(midLevel, 0, 0.3);
        highLevel = lerp(highLevel, 0, 0.3);
        colorPulse *= IMPULSE_DECAY;
        return;
      }

      lowMaximum = Math.max(levels.low, lowMaximum * 0.995);
      midMaximum = Math.max(levels.mid, midMaximum * 0.995);
      highMaximum = Math.max(levels.high, highMaximum * 0.995);
      const lowTarget = Math.sqrt(levels.low / lowMaximum);
      const midTarget = Math.sqrt(levels.mid / midMaximum);
      const highTarget = Math.sqrt(levels.high / highMaximum);
      if (!audioLevelsReady) {
        lowLevel = lowTarget;
        midLevel = midTarget;
        highLevel = highTarget;
        previousLow = lowLevel;
        previousHigh = highLevel;
        audioLevelsReady = true;
        return;
      }

      lowLevel = lerp(lowLevel, lowTarget, lowTarget > lowLevel ? 0.55 : 0.3);
      midLevel = lerp(midLevel, midTarget, midTarget > midLevel ? 0.5 : 0.28);
      highLevel = lerp(highLevel, highTarget, highTarget > highLevel ? 0.5 : 0.32);
      colorPulse *= IMPULSE_DECAY;

      if (time - lastPeak >= PEAK_COOLDOWN) {
        const lowRise = lowLevel - previousLow;
        const highRise = highLevel - previousHigh;
        if (lowRise > 0.06) {
          triggerImpulse(0.65 + Math.min(1, lowRise * 5) * 1.35, false);
          colorPulse = Math.max(colorPulse, Math.min(0.35, lowRise * 2));
          lastPeak = time;
        } else if (highRise > 0.09) {
          triggerImpulse(0.45 + Math.min(1, highRise * 6) * 0.8, true);
          colorPulse = Math.max(colorPulse, Math.min(1, 0.35 + highRise * 4));
          lastPeak = time;
        }
      }

      previousLow = lowLevel;
      previousHigh = highLevel;
    };

    const renderGlow = () => {
      screenContext.save();
      screenContext.filter = `blur(8px) brightness(${200 + colorPulse * 100}%)`;
      screenContext.globalCompositeOperation = 'lighter';
      screenContext.drawImage(particleCanvas, 0, 0, width, height);
      screenContext.restore();

      screenContext.save();
      screenContext.filter = `blur(4px) brightness(${200 + colorPulse * 100}%)`;
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

    const renderFrame = (time: number) => {
      tick += SPEED_SCALE;
      updateMusicImpulse(time);
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
      renderFrame(time);
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
      renderFrame(performance.now());
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
  }, [audioEngine]);

  return <canvas ref={canvasRef} class="signal-background" aria-hidden="true" />;
}
