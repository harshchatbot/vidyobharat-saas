'use client';

import React from 'react';

interface Planet {
  name: string;
  color: string;
  orbitMultiplier: number;
  sizeMultiplier: number;
  duration: number;
  ring?: boolean;
}

interface SolarLoaderProps {
  size?: number;
  speed?: number;
  className?: string;
}

const PLANETS: Planet[] = [
  { name: 'Mercury', color: 'from-gray-400 to-gray-600', orbitMultiplier: 0.4, sizeMultiplier: 0.4, duration: 8 },
  { name: 'Venus', color: 'from-yellow-300 to-yellow-500', orbitMultiplier: 0.6, sizeMultiplier: 0.7, duration: 12 },
  { name: 'Earth', color: 'from-blue-400 to-blue-600', orbitMultiplier: 0.85, sizeMultiplier: 0.75, duration: 15 },
  { name: 'Mars', color: 'from-red-400 to-red-600', orbitMultiplier: 1.1, sizeMultiplier: 0.6, duration: 18 },
  { name: 'Jupiter', color: 'from-orange-400 to-orange-600', orbitMultiplier: 1.5, sizeMultiplier: 1.4, duration: 24, ring: false },
  { name: 'Saturn', color: 'from-yellow-200 to-yellow-400', orbitMultiplier: 1.8, sizeMultiplier: 1.2, duration: 28, ring: true },
  { name: 'Uranus', color: 'from-cyan-300 to-cyan-500', orbitMultiplier: 2.0, sizeMultiplier: 0.9, duration: 32 },
  { name: 'Neptune', color: 'from-blue-500 to-blue-700', orbitMultiplier: 2.2, sizeMultiplier: 0.85, duration: 36 },
];

export default function SolarLoader({ size = 40, speed = 1, className = '' }: SolarLoaderProps) {
  const baseSize = size;
  const effectiveSpeed = speed;

  return (
    <>
      <style>{`
        @keyframes orbit3d {
          0% {
            transform: rotateX(60deg) rotateZ(0deg);
          }
          100% {
            transform: rotateX(60deg) rotateZ(360deg);
          }
        }

        @keyframes tilt {
          0%, 100% {
            transform: rotateX(60deg);
          }
          50% {
            transform: rotateX(70deg);
          }
        }

        .solar-system {
          perspective: 1000px;
          width: ${baseSize * 5.2}px;
          height: ${baseSize * 5.2}px;
        }

        .solar-center {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: ${baseSize * 0.4}px;
          height: ${baseSize * 0.4}px;
          background: radial-gradient(circle, #FDB813 0%, #FDB813 40%, #FDB813 100%);
          border-radius: 50%;
          box-shadow: 0 0 ${baseSize * 0.8}px rgba(253, 184, 19, 0.8),
                      0 0 ${baseSize * 1.6}px rgba(253, 184, 19, 0.4);
          z-index: 10;
        }

        .orbit {
          position: absolute;
          top: 50%;
          left: 50%;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          animation: orbit3d ${360}s linear infinite;
        }

        .planet {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          border-radius: 50%;
          background-clip: padding-box;
        }

        .planet-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotateX(75deg);
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
        }
      `}</style>

      <div className={`solar-system ${className}`}>
        <div className="solar-center" />
        {PLANETS.map((planet, index) => {
          const orbitRadius = baseSize * 2.6 * planet.orbitMultiplier;
          const duration = (planet.duration / effectiveSpeed);
          const planetSize = baseSize * 0.4 * planet.sizeMultiplier;

          return (
            <div
              key={planet.name}
              className="orbit"
              style={{
                width: orbitRadius * 2,
                height: orbitRadius * 2,
                animationDuration: `${duration}s`,
                animationDelay: `${-duration * (index / PLANETS.length)}s`,
              }}
            >
              <div
                className={`planet bg-gradient-to-br ${planet.color}`}
                style={{
                  width: planetSize,
                  height: planetSize,
                  top: 0,
                }}
                title={planet.name}
              >
                {planet.ring && (
                  <div
                    className="planet-ring"
                    style={{
                      width: planetSize * 1.6,
                      height: planetSize * 0.4,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
