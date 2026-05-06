import { motion } from "framer-motion";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "../lib/utils";

const SHOP_SECTIONS = [
  { id: "themes", label: "Themes" },
  { id: "effects", label: "Caret & Text FX" },
  { id: "pets", label: "TypeBuddies" },
] as const;

export function ShopView() {
  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Shop Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-[var(--text)] to-[var(--accent)] bg-clip-text text-transparent">
            The Library Shop
          </h1>
          <p className="text-lg text-[var(--text-muted)] max-w-md leading-relaxed">
            Enhance your typing experience with exclusive cosmic themes and loyal companions.
          </p>
        </div>
        
        <div className="flex items-center gap-1 p-1 rounded-2xl border border-[var(--border)] bg-[var(--panel)]/50 backdrop-blur-xl shadow-2xl">
          <div className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--panel-soft)]/50 rounded-xl cursor-default">
            <div className="flex flex-col items-end">
              <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-bold">Ink Balance</span>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                <span className="font-mono text-2xl font-bold text-[var(--text)]">1,250</span>
              </div>
            </div>
          </div>
          
          <div className="h-10 w-[1px] bg-[var(--border)]/50 mx-2" />
          
          <div className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--panel-soft)]/50 rounded-xl cursor-default">
            <div className="flex flex-col items-end">
              <span className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-bold">Total Pages</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl font-bold text-[var(--accent)]">452</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="grid gap-8">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Premium Themes</h2>
            <span className="text-xs text-[var(--text-muted)]">Dynamic backgrounds & custom colors</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ShopItem 
              title="Nebula Drift" 
              description="A slow-moving cosmic background with shifting violet and indigo hues." 
              price={500} 
              currency="Ink" 
              tag="Dynamic"
            />
            <ShopItem 
              title="Rainy Window" 
              description="Subtle rain animations and soft blue tones for a melancholic focus." 
              price={500} 
              currency="Ink" 
              tag="Dynamic"
            />
            <ShopItem 
              title="Cyberpunk Grid" 
              description="High-contrast neon colors with a pulsing grid floor effect." 
              price={300} 
              currency="Ink" 
            />
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Caret & Text FX</h2>
            <span className="text-xs text-[var(--text-muted)]">Visual flair for every keystroke</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ShopItem 
              title="Ghost Trail" 
              description="The caret leaves a fading particle trail as you type across the page." 
              price={200} 
              currency="Ink" 
            />
            <ShopItem 
              title="Electric Spark" 
              description="Characters emit tiny sparks when typed correctly." 
              price={150} 
              currency="Ink" 
            />
            <ShopItem 
              title="Floating Words" 
              description="Correctly typed words float up slightly and fade into the background." 
              price={100} 
              currency="Pages" 
            />
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">TypeBuddies</h2>
            <span className="text-xs text-[var(--text-muted)]">Your companions on the typing journey</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ShopItem 
              title="Inkwell the Squid" 
              description="A small pixel-art squid that inks your mistakes and cheers for your speed." 
              price={800} 
              currency="Ink" 
              tag="Legendary"
            />
            <ShopItem 
              title="Binary the Bot" 
              description="A floating robot that computes your WPM and displays it on its screen." 
              price={600} 
              currency="Ink" 
              tag="Epic"
            />
            <ShopItem 
              title="Draft the Dog" 
              description="A loyal golden retriever that wags its tail for every correct word." 
              price={5000} 
              currency="Pages" 
            />
          </div>
        </section>
      </div>
    </div>
  );
}

interface ShopItemProps {
  title: string;
  description: string;
  price: number;
  currency: "Ink" | "Pages";
  tag?: string;
  isUnlocked?: boolean;
}

function ShopItem({ title, description, price, currency, tag, isUnlocked }: ShopItemProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="group relative flex h-full flex-col overflow-hidden border-[var(--border)] bg-[var(--panel)] transition-all hover:border-[var(--accent)] hover:shadow-xl hover:shadow-[var(--accentSoft)]">
        {tag && (
          <div className={cn(
            "absolute right-3 top-3 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm",
            tag === "Legendary" ? "bg-gradient-to-r from-amber-500 to-orange-600" :
            tag === "Epic" ? "bg-gradient-to-r from-purple-500 to-indigo-600" :
            "bg-[var(--accent)]"
          )}>
            {tag}
          </div>
        )}
        
        <div className="flex flex-1 flex-col p-5">
          <div className="mb-4 h-36 w-full overflow-hidden rounded-xl bg-[var(--panel-soft)] flex items-center justify-center border border-[var(--border)] group-hover:border-[var(--accent-soft)] transition-all relative">
            {/* Abstract visual based on title */}
            <div className={cn(
              "absolute inset-0 opacity-40 blur-2xl group-hover:opacity-60 transition-opacity",
              title.includes("Nebula") ? "bg-gradient-to-br from-purple-600 via-indigo-900 to-blue-800" :
              title.includes("Rainy") ? "bg-gradient-to-br from-blue-400 via-slate-600 to-slate-800" :
              title.includes("Cyberpunk") ? "bg-gradient-to-br from-pink-600 via-purple-900 to-cyan-400" :
              title.includes("Ghost") ? "bg-gradient-to-br from-slate-200 via-slate-400 to-transparent" :
              title.includes("Electric") ? "bg-gradient-to-br from-yellow-300 via-orange-500 to-transparent" :
              title.includes("Inkwell") ? "bg-gradient-to-br from-indigo-500 via-purple-700 to-black" :
              title.includes("Binary") ? "bg-gradient-to-br from-emerald-400 via-teal-700 to-transparent" :
              "bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600"
            )} />
            <div className="relative z-10 flex flex-col items-center gap-2">
              <span className="text-sm font-bold uppercase tracking-widest text-white/50 group-hover:text-white/80 transition-colors">Preview</span>
              <div className="h-[2px] w-8 bg-[var(--panel-soft)] group-hover:w-12 transition-all" />
            </div>
          </div>
          <h3 className="text-lg font-bold group-hover:text-[var(--accent)] transition-colors">{title}</h3>
          <p className="mt-2 text-sm text-[var(--text-muted)] line-clamp-3">
            {description}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--panel-soft)_40%,transparent)] p-4">
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-2 w-2 rounded-full",
              currency === "Ink" ? "bg-[var(--accent)]" : "bg-[var(--text)]"
            )} />
            <div className="flex flex-col">
              <span className={cn(
                "font-mono text-sm font-bold leading-none",
                currency === "Ink" ? "text-[var(--accent)]" : "text-[var(--text)]"
              )}>
                {price.toLocaleString()}
              </span>
              <span className="text-[9px] uppercase tracking-tighter text-[var(--text-muted)]">{currency}</span>
            </div>
          </div>
          <Button 
            variant="secondary" 
            className="rounded-full px-5 h-9 text-xs font-bold transition-all hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] active:scale-95"
            onClick={() => console.log(`Purchased ${title}`)}
          >
            Unlock
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
