"use client";

import { motion } from "framer-motion";

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 32 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg
        className="h-full w-full text-white"
        viewBox="0 0 696 316"
        fill="none"
        aria-hidden="true"
      >
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.035 + path.id * 0.012}
            initial={{ pathLength: 0.25, opacity: 0.3 }}
            animate={{
              pathLength: 1,
              opacity: [0.12, 0.28, 0.12],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 24 + path.id * 0.18,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export function BackgroundPathsDecorative() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-[-18%] top-[-12%] h-[34rem] opacity-50 blur-[0.2px]">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      <div className="absolute left-1/2 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-[hsl(var(--color-accent)/0.12)] blur-3xl" />
    </div>
  );
}