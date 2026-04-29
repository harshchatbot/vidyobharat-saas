"use client";

import React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

export const LampContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "relative z-0 flex min-h-[34rem] w-full flex-col items-center justify-center overflow-hidden rounded-[36px] bg-slate-950 md:min-h-[40rem]",
        className
      )}
    >
      <div className="relative isolate z-0 flex w-full flex-1 scale-y-125 items-center justify-center">
        <motion.div
          initial={{ opacity: 0.35, width: "12rem" }}
          whileInView={{ opacity: 1, width: "28rem" }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{
            delay: 0.15,
            duration: 0.8,
            ease: "easeInOut",
          }}
          style={{
            backgroundImage:
              "conic-gradient(var(--conic-position), var(--tw-gradient-stops))",
          }}
          className="absolute inset-auto right-1/2 h-56 w-[28rem] overflow-visible bg-gradient-conic from-cyan-500 via-transparent to-transparent text-white [--conic-position:from_70deg_at_center_top]"
        >
          <div className="absolute bottom-0 left-0 z-20 h-40 w-full bg-slate-950 [mask-image:linear-gradient(to_top,white,transparent)]" />
          <div className="absolute bottom-0 left-0 z-20 h-full w-40 bg-slate-950 [mask-image:linear-gradient(to_right,white,transparent)]" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0.35, width: "12rem" }}
          whileInView={{ opacity: 1, width: "28rem" }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{
            delay: 0.15,
            duration: 0.8,
            ease: "easeInOut",
          }}
          style={{
            backgroundImage:
              "conic-gradient(var(--conic-position), var(--tw-gradient-stops))",
          }}
          className="absolute inset-auto left-1/2 h-56 w-[28rem] bg-gradient-conic from-transparent via-transparent to-cyan-500 text-white [--conic-position:from_290deg_at_center_top]"
        >
          <div className="absolute bottom-0 right-0 z-20 h-full w-40 bg-slate-950 [mask-image:linear-gradient(to_left,white,transparent)]" />
          <div className="absolute bottom-0 right-0 z-20 h-40 w-full bg-slate-950 [mask-image:linear-gradient(to_top,white,transparent)]" />
        </motion.div>

        <div className="absolute top-1/2 h-48 w-full translate-y-12 scale-x-150 bg-slate-950 blur-2xl" />
        <div className="absolute top-1/2 z-50 h-48 w-full bg-transparent opacity-10 backdrop-blur-md" />
        <div className="absolute inset-auto z-50 h-36 w-[24rem] -translate-y-1/2 rounded-full bg-cyan-500 opacity-40 blur-3xl md:w-[28rem]" />

        <motion.div
          initial={{ width: "8rem" }}
          whileInView={{ width: "16rem" }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{
            delay: 0.15,
            duration: 0.8,
            ease: "easeInOut",
          }}
          className="absolute inset-auto z-30 h-36 w-64 -translate-y-[6rem] rounded-full bg-cyan-400 blur-2xl"
        />

        <motion.div
          initial={{ width: "12rem" }}
          whileInView={{ width: "28rem" }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{
            delay: 0.15,
            duration: 0.8,
            ease: "easeInOut",
          }}
          className="absolute inset-auto z-50 h-0.5 w-[28rem] -translate-y-[7rem] bg-cyan-400"
        />

        <div className="absolute inset-auto z-40 h-44 w-full -translate-y-[12.5rem] bg-slate-950" />
      </div>

      <div className="relative z-50 flex -translate-y-36 flex-col items-center px-5 md:-translate-y-48">
        {children}
      </div>
    </div>
  );
};