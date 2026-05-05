import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "../lib/utils";

// Pre-calculate window and OS info to avoid overhead in render/events
const appWindow = getCurrentWindow();
const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes("mac");

export function Titlebar() {
  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    void appWindow.minimize();
  };
  
  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    void appWindow.toggleMaximize();
  };
  
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    void appWindow.close();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    // Only toggle maximize if clicking the drag region, not buttons
    const target = e.target as HTMLElement;
    if (target.hasAttribute("data-tauri-drag-region") || target.tagName === "HEADER") {
      void appWindow.toggleMaximize();
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .tauri-drag {
          -webkit-app-region: drag !important;
        }
        .no-drag {
          -webkit-app-region: no-drag !important;
          pointer-events: auto !important;
        }
      `}} />
      
      {/* 
        The Visual Titlebar
        Using data-tauri-drag-region + -webkit-app-region: drag for zero-overhead native dragging.
        JS handleMouseDown fallback removed to ensure absolutely zero computational usage during idle/drag.
      */}
      <header
        data-tauri-drag-region
        onDoubleClick={handleDoubleClick}
        className={cn(
          "flex h-10 w-full select-none items-center justify-between px-4",
          "fixed top-0 left-0 right-0 z-[2147483647] tauri-drag",
          "bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] backdrop-blur-sm",
          "border-b border-white/[0.03]",
          "cursor-default group"
        )}
      >
        {/* Left side: Controls Area */}
        <div className="relative z-[2147483647] flex h-full items-center no-drag">
          {!isMac ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleClose}
                className="h-3 w-3 rounded-full bg-[#ed8796] hover:brightness-110 transition-all active:scale-90"
                title="Close"
              />
              <button
                onClick={handleMinimize}
                className="h-3 w-3 rounded-full bg-[#eed49f] hover:brightness-110 transition-all active:scale-90"
                title="Minimize"
              />
              <button
                onClick={handleMaximize}
                className="h-3 w-3 rounded-full bg-[#a6da95] hover:brightness-110 transition-all active:scale-90"
                title="Maximize"
              />
            </div>
          ) : (
            /* Spacer for macOS traffic lights */
            <div className="w-[88px]" />
          )}
        </div>

        {/* App Title - Now also a drag target */}
        <div data-tauri-drag-region className="flex-1 flex h-full items-center justify-center">
          <span data-tauri-drag-region className="text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)] opacity-60 group-hover:opacity-80 transition-opacity">
            TypeRead
          </span>
        </div>

        {/* Right side spacer to balance layout */}
        <div data-tauri-drag-region className="w-[88px] h-full flex items-center justify-end">
          <div className="no-drag w-10 h-full" />
        </div>
      </header>
    </>
  );
}
