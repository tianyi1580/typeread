import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

interface VersusConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (cpm: number) => void;
  currentCpm: number;
  averageWpm: number;
}

export function VersusConfigModal({
  isOpen,
  onClose,
  onStart,
  currentCpm,
  averageWpm,
}: VersusConfigModalProps) {
  const [cpm, setCpm] = useState(currentCpm);
  const averageCpm = Math.round(averageWpm * 5);

  useEffect(() => {
    if (isOpen) {
      setCpm(currentCpm);
    }
  }, [currentCpm, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      
      <Card className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-[var(--panel)] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-50" />
        
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">Configure Versus Bot</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Set the speed of the bot you'll be racing against.
          </p>
        </div>

        <div className="mt-10 space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-widest">Bot Speed</span>
              <span className="text-2xl font-bold text-[var(--accent)]">{cpm} <span className="text-xs font-normal text-[var(--text-muted)]">CPM</span></span>
            </div>
            
            <input
              type="range"
              min="50"
              max="1000"
              step="10"
              value={cpm}
              onChange={(e) => setCpm(parseInt(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent)]"
            />
            
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
              <span>50 CPM</span>
              <span>1000 CPM</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button 
              variant="secondary" 
              className="w-full rounded-2xl border-white/5 bg-white/5 py-6 hover:bg-white/10"
              onClick={() => setCpm(averageCpm)}
            >
              <div className="flex w-full items-center justify-between px-2">
                <span className="text-sm">Use My Average Speed</span>
                <span className="font-bold text-[var(--accent)]">{averageCpm} CPM</span>
              </div>
            </Button>
          </div>
        </div>

        <div className="mt-10 flex gap-3">
          <Button 
            variant="ghost" 
            className="flex-1 rounded-2xl py-6 text-[var(--text-muted)]" 
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button 
            className="flex-1 rounded-2xl bg-[var(--accent)] py-6 font-bold text-black hover:opacity-90"
            onClick={() => onStart(cpm)}
          >
            Start Race
          </Button>
        </div>
      </Card>
    </div>
  );
}
