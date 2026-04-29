import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { clamp, cn } from "../../lib/utils";

/**
 * Properties for the InfoTooltip component.
 */
interface InfoTooltipProps {
  /** The text content to display inside the tooltip. */
  content: string;
  /** The element that triggers the tooltip. */
  children: React.ReactNode;
  /** How the tooltip is triggered (hover or click). */
  trigger?: "hover" | "click";
  /** Optional class name for the wrapper. */
  className?: string;
  /** Optional max width for the tooltip. */
  maxWidth?: string;
}


interface TooltipPosition {
  top: number;
  left: number;
}

const VIEWPORT_PADDING = 12;

export function InfoTooltip({
  content,
  children,
  trigger = "hover",
  className,
  maxWidth = "280px",
}: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // The portal tooltip renders above its anchor with a translate transform, so
  // the anchor coordinates need to be clamped against the tooltip's size.
  const clampPosition = (nextPosition: TooltipPosition): TooltipPosition => {
    const tooltip = tooltipRef.current;

    if (!tooltip) {
      return nextPosition;
    }

    const { width, height } = tooltip.getBoundingClientRect();
    const minLeft = width / 2 + VIEWPORT_PADDING;
    const maxLeft = window.innerWidth - minLeft;
    const minTop = height + VIEWPORT_PADDING;
    const maxTop = window.innerHeight - VIEWPORT_PADDING;

    return {
      left: minLeft > maxLeft ? window.innerWidth / 2 : clamp(nextPosition.left, minLeft, maxLeft),
      top: minTop > maxTop ? maxTop : clamp(nextPosition.top, minTop, maxTop),
    };
  };

  const updatePosition = (e?: React.MouseEvent | MouseEvent) => {
    let nextPosition: TooltipPosition | null = null;

    if (trigger === "hover" && e) {
      nextPosition = {
        top: e.clientY - 15,
        left: e.clientX,
      };
    } else if (trigger === "click" && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      nextPosition = {
        top: rect.top - 10,
        left: rect.left + rect.width / 2,
      };
    }

    if (nextPosition) {
      setPosition(clampPosition(nextPosition));
    }
  };

  useLayoutEffect(() => {
    if (!isVisible) {
      return;
    }

    setPosition((currentPosition) => {
      const clampedPosition = clampPosition(currentPosition);

      if (
        clampedPosition.top === currentPosition.top &&
        clampedPosition.left === currentPosition.left
      ) {
        return currentPosition;
      }

      return clampedPosition;
    });
  }, [content, isVisible, maxWidth]);

  useEffect(() => {
    if (isVisible && trigger === "click") {
      const handleResize = () => updatePosition();
      window.addEventListener("resize", handleResize);
      window.addEventListener("scroll", handleResize, true);
      return () => {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleResize, true);
      };
    }
  }, [isVisible, trigger]);

  // Close on click outside for popover mode
  useEffect(() => {
    if (trigger === "click" && isVisible) {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          tooltipRef.current &&
          !tooltipRef.current.contains(event.target as Node) &&
          triggerRef.current &&
          !triggerRef.current.contains(event.target as Node)
        ) {
          setIsVisible(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isVisible, trigger]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (trigger === "hover") {
      updatePosition(e);
      setIsVisible(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (trigger === "hover" && isVisible) {
      updatePosition(e);
    }
  };

  const handleMouseLeave = () => trigger === "hover" && setIsVisible(false);
  
  const handleClick = (e: React.MouseEvent) => {
    if (trigger === "click") {
      e.stopPropagation();
      updatePosition();
      setIsVisible((visible) => !visible);
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        className={cn("inline-flex items-center", className)}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {children}
      </div>
      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          className={cn(
            "fixed z-[10000] px-4 py-3 text-[13px] leading-relaxed text-[var(--text)] bg-[rgba(36,39,58,0.95)] border border-[rgba(145,215,227,0.3)] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl animate-tooltip-in",
            trigger === "hover" ? "pointer-events-none" : "pointer-events-auto"
          )}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            maxWidth,
            // Ensure it doesn't go off screen
            transformOrigin: "bottom center",
          }}
        >
          <div className="relative z-10">{content}</div>
          {trigger === "click" && (
            <div 
              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 rotate-45 bg-[rgba(36,39,58,0.95)] border-r border-b border-[rgba(145,215,227,0.3)]"
            />
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export function InfoIcon({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-help", className)}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-full w-full text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    </div>
  );
}
