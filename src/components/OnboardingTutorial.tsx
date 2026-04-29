import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "./ui/button";
import { useAppStore } from "../store/app-store";

/**
 * Component that renders an onboarding tutorial overlay for first-time users.
 * Uses a spotlight effect to guide the user through the interface.
 */
export function OnboardingTutorial() {

  const [step, setStep] = useState<1 | 2 | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const checkIntervalRef = useRef<number | null>(null);

  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);

  useEffect(() => {
    // Check if the user has already completed the onboarding tutorial
    const hasSeenTutorial = localStorage.getItem("typeread_tutorial_completed");
    if (!hasSeenTutorial) {
      setStep(1);
      // Mark as seen immediately so it appears exactly once on first load
      localStorage.setItem("typeread_tutorial_completed", "true");
    }
  }, []);

  useEffect(() => {
    if (!step) {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      setTargetRect(null);
      return;
    }

    // Automatically redirect to the Library tab for Step 1
    if (step === 1 && activeTab !== "library") {
      setActiveTab("library");
    }

    const updateRect = () => {
      let targetId = "";
      if (step === 1) {
        const emptyBtn = document.getElementById("tutorial-tips-btn-empty");
        const headerBtn = document.getElementById("tutorial-tips-btn-header");
        
        // Pick the button that is currently visible in the DOM
        if (emptyBtn && emptyBtn.getBoundingClientRect().width > 0) {
          targetId = "tutorial-tips-btn-empty";
        } else if (headerBtn && headerBtn.getBoundingClientRect().width > 0) {
          targetId = "tutorial-tips-btn-header";
        }
      } else if (step === 2) {
        targetId = "tutorial-menu-button";
      }

      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) {
          const rect = el.getBoundingClientRect();
          setTargetRect(rect);
        }
      }
    };

    updateRect();
    checkIntervalRef.current = window.setInterval(updateRect, 200);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [step, activeTab, setActiveTab]);

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else {
      setStep(null);
      localStorage.setItem("typeread_tutorial_completed", "true");
    }
  };

  const handleSkip = () => {
    setStep(null);
    localStorage.setItem("typeread_tutorial_completed", "true");
  };

  if (!step || !targetRect) return null;

  const padding = 12;
  const spotlightX = targetRect.left - padding;
  const spotlightY = targetRect.top - padding;
  const spotlightW = targetRect.width + padding * 2;
  const spotlightH = targetRect.height + padding * 2;

  const cardWidth = 320;
  const screenHeight = window.innerHeight;
  const screenWidth = window.innerWidth;

  // Constrain card horizontally inside viewport
  let cardX = targetRect.left + targetRect.width / 2 - cardWidth / 2;
  if (cardX < 20) cardX = 20;
  if (cardX + cardWidth > screenWidth - 20) cardX = screenWidth - 20 - cardWidth;

  // Determine vertical direction of the arrow
  const isLowerHalf = targetRect.top > screenHeight / 2;
  let cardY = 0;
  let arrowDirection: "up" | "down" = "up";

  if (isLowerHalf) {
    cardY = targetRect.top - 210; // Allocate comfortable height
    arrowDirection = "down";
  } else {
    cardY = targetRect.bottom + 24;
    arrowDirection = "up";
  }

  // Constrain arrow inside card
  let arrowX = targetRect.left + targetRect.width / 2 - cardX;
  if (arrowX < 24) arrowX = 24;
  if (arrowX > cardWidth - 24) arrowX = cardWidth - 24;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none font-sans">
      {/* Dark Overlay Background with Cutout Mask */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto cursor-default" onClick={handleSkip}>
        <defs>
          <mask id="tutorial-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={spotlightX}
              y={spotlightY}
              width={spotlightW}
              height={spotlightH}
              rx={16}
              ry={16}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(10, 10, 15, 0.72)"
          mask="url(#tutorial-spotlight-mask)"
          className="backdrop-blur-[2px] transition-all duration-300"
        />
      </svg>

      {/* Spotlight Border Visual Effect */}
      <motion.div
        initial={false}
        animate={{
          left: spotlightX,
          top: spotlightY,
          width: spotlightW,
          height: spotlightH,
        }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="absolute border-2 border-[var(--accent)] rounded-[16px] shadow-[0_0_24px_rgba(138,173,244,0.4)] pointer-events-none"
      />

      {/* Floating Guided Overlay Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: arrowDirection === "up" ? 12 : -12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={{
          position: "absolute",
          left: cardX,
          top: cardY,
          width: cardWidth,
        }}
        className="pointer-events-auto rounded-[28px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--panel)_85%,transparent)] p-6 shadow-panel backdrop-blur-2xl"
      >
        <div className="relative">
          {/* Arrow pointing to visual focus */}
          <div
            style={{ left: arrowX }}
            className={`absolute -translate-x-1/2 w-4 h-4 bg-[var(--panel)] border-[var(--border)] rotate-45 ${
              arrowDirection === "up"
                ? "-top-[33px] border-t border-l"
                : "-bottom-[33px] border-r border-b"
            }`}
          />

          <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--accent)] font-bold">
            Tutorial • Step {step} of 2
          </p>
          <h3 className="mt-2.5 text-lg font-semibold tracking-tight text-[var(--text)]">
            {step === 1 ? "Upload Your First Book" : "Navigate the App"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            {step === 1
              ? "Click the help icon here to view the tips guide for finding DRM-free texts and easily getting books imported into your local list."
              : "Use the primary application menu to check statistics, achievements, configuration parameters, or load testing layouts."}
          </p>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-150"
            >
              Skip Tutorial
            </button>
            <Button onClick={handleNext} className="rounded-[16px] px-5 py-2 text-xs font-bold tracking-wide shadow-md">
              {step === 1 ? "Continue" : "Finish"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
