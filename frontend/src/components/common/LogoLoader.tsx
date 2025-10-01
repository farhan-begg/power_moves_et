// src/components/common/LogoLoader.tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import logoUrl from "../../assets/images/logoPng.png";

type Props = {
  show?: boolean; // optional control flag
};

export default function LogoLoader({ show = true }: Props) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center 
                     bg-transparent backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }} // slower fade
        >
          {/* Centerpiece logo with sci-fi glow */}
          <motion.img
            src={logoUrl}
            alt="Loading"
            draggable={false}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{
              duration: 1.4, // slower transitions
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "reverse",
            }}
            className="w-[min(70vw,70vh)] max-w-[92vw] max-h-[92vh] 
                       object-contain select-none 
                       drop-shadow-[0_0_25px_rgba(0,255,255,0.7)]"
          />

          {/* Bottom holo rail */}
          <div className="pointer-events-none absolute left-1/2 bottom-12 -translate-x-1/2 w-[60%] max-w-xl">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden backdrop-blur-sm">
              <div className="h-full w-2/5 animate-indeterminate-bar 
                              bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
            </div>
            <div className="mt-2 h-px w-full 
                            bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
          </div>

          <span className="sr-only">Loading</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
