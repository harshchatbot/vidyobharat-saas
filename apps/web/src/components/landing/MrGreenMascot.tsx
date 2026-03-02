'use client';

import { useEffect } from 'react';

import { motion, useAnimation } from 'framer-motion';

type MascotSize = 'sm' | 'md' | 'lg';

type MrGreenMascotProps = {
  className?: string;
  size?: MascotSize;
};

export function MrGreenMascot({ className = '', size = 'md' }: MrGreenMascotProps) {
  const sizeClasses: Record<MascotSize, string> = {
    sm: 'h-20 w-20 sm:h-24 sm:w-24',
    md: 'h-32 w-32 sm:h-36 sm:w-36',
    lg: 'h-44 w-44 sm:h-52 sm:w-52',
  };
  const eyeShellClasses: Record<MascotSize, string> = {
    sm: 'top-[35%] h-6 w-6',
    md: 'top-[33%] h-7 w-7',
    lg: 'top-[31%] h-8 w-8',
  };
  const pupilClasses: Record<MascotSize, string> = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
  };
  const armLeftClasses: Record<MascotSize, string> = {
    sm: '-left-4 top-[42%] sm:-left-7 sm:top-[41%]',
    md: '-left-7 top-[41%]',
    lg: '-left-9 top-[40%]',
  };
  const armRightClasses: Record<MascotSize, string> = {
    sm: '-right-4 top-[44%] sm:-right-7 sm:top-[43%]',
    md: '-right-7 top-[43%]',
    lg: '-right-9 top-[43%]',
  };
  const armBarClasses: Record<MascotSize, string> = {
    sm: 'h-1.5 w-4 sm:h-2 sm:w-6',
    md: 'h-2 w-6',
    lg: 'h-2 w-8',
  };
  const armPalmClasses: Record<MascotSize, string> = {
    sm: 'h-2.5 w-2.5 sm:h-3 sm:w-3',
    md: 'h-3 w-3',
    lg: 'h-3 w-3',
  };
  const eyeControls = useAnimation();

  const blink = () => {
    void eyeControls.start({
      scaleY: [1, 0.22, 1],
      transition: { duration: 0.18, times: [0, 0.5, 1], ease: 'easeInOut' },
    });
  };

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let active = true;

    const scheduleBlink = () => {
      const waitMs = 2600 + Math.floor(Math.random() * 2600);
      timeoutId = setTimeout(() => {
        if (!active) return;
        blink();
        scheduleBlink();
      }, waitMs);
    };

    scheduleBlink();

    return () => {
      active = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  return (
    <motion.div
      initial={{ y: 8 }}
      animate={{ y: [-4, 8, -4] }}
      transition={{ duration: 4.5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      className={`relative ${sizeClasses[size]} ${className} cursor-pointer`}
      role="button"
      tabIndex={0}
      aria-label="Mr Green mascot"
      onClick={blink}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          blink();
        }
      }}
    >
      <motion.div
        animate={{ rotate: [14, -10, 14] }}
        transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        className={`absolute origin-right ${armLeftClasses[size]}`}
      >
        <div className={`rounded-full bg-green-400 ${armBarClasses[size]}`} />
        <div className={`absolute -left-1 -top-0.5 rounded-full bg-lime-200 ${armPalmClasses[size]}`} />
      </motion.div>
      <div className={`absolute ${armRightClasses[size]}`}>
        <div className={`rounded-full bg-green-400 ${armBarClasses[size]}`} />
        <div className={`absolute -right-1 -top-0.5 rounded-full bg-lime-200 ${armPalmClasses[size]}`} />
      </div>

      <div className="absolute inset-0 rounded-[36%] bg-gradient-to-b from-lime-300 to-green-500 shadow-[0_28px_60px_-20px_rgba(34,197,94,0.55)]" />
      <div className="absolute inset-[10%] rounded-[34%] border-2 border-white/30" />

      <motion.div
        animate={{ rotate: [0, -6, 0, 6, 0] }}
        transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        className="absolute -left-6 top-7 hidden h-8 w-8 rounded-full bg-lime-200 sm:block"
      />
      <motion.div
        animate={{ rotate: [0, 8, 0, -8, 0] }}
        transition={{ duration: 5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        className="absolute -right-5 top-9 hidden h-7 w-7 rounded-full bg-lime-100 sm:block"
      />

      <motion.div
        className={`absolute left-[24%] flex items-center justify-center rounded-full bg-white ${eyeShellClasses[size]}`}
        animate={eyeControls}
        style={{ transformOrigin: 'center center' }}
      >
        <div className={`relative rounded-full bg-zinc-900 ${pupilClasses[size]}`}>
          <div className="absolute left-0.5 top-0.5 h-1 w-1 rounded-full bg-white/80" />
        </div>
      </motion.div>
      <motion.div
        className={`absolute right-[24%] flex items-center justify-center rounded-full bg-white ${eyeShellClasses[size]}`}
        animate={eyeControls}
        style={{ transformOrigin: 'center center' }}
      >
        <div className={`relative rounded-full bg-zinc-900 ${pupilClasses[size]}`}>
          <div className="absolute left-0.5 top-0.5 h-1 w-1 rounded-full bg-white/80" />
        </div>
      </motion.div>

      <div className="absolute bottom-[28%] left-1/2 h-8 w-16 -translate-x-1/2 rounded-b-full border-b-[5px] border-zinc-900" />
      <div className="absolute -bottom-3 left-[35%] h-7 w-2 rounded-full bg-green-500" />
      <div className="absolute -bottom-3 right-[35%] h-7 w-2 rounded-full bg-green-500" />
      <div className="absolute -bottom-5 left-[31%] h-2 w-4 rounded-full bg-lime-100" />
      <div className="absolute -bottom-5 right-[31%] h-2 w-4 rounded-full bg-lime-100" />
      <div className="absolute -bottom-10 left-1/2 h-6 w-20 -translate-x-1/2 rounded-full bg-green-950/20 blur-md" />
    </motion.div>
  );
}
