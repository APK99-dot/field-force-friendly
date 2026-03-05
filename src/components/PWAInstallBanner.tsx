import { useState, useEffect } from "react";
import { Download, X, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // Check if dismissed recently
    const dismissedAt = localStorage.getItem("pwa-banner-dismissed");
    if (dismissedAt && Date.now() - Number(dismissedAt) < 24 * 60 * 60 * 1000) return;

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);

    if (ios) {
      // Show iOS guidance banner
      setShowBanner(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Fallback: show banner after 3s even without prompt (for browsers that don't fire it)
    const fallbackTimer = setTimeout(() => {
      if (!window.matchMedia("(display-mode: standalone)").matches) {
        setShowBanner(true);
      }
    }, 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShowBanner(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowBanner(false);
    localStorage.setItem("pwa-banner-dismissed", String(Date.now()));
  };

  if (dismissed || !showBanner) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mx-4 mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Install App</p>
            {isIOS ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Tap <Share className="inline h-3 w-3 mx-0.5" /> Share, then <Plus className="inline h-3 w-3 mx-0.5" /> Add to Home Screen
              </p>
            ) : deferredPrompt ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Get a faster, native-like experience
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                Use your browser menu → "Install app" or "Add to Home Screen"
              </p>
            )}
            {deferredPrompt && (
              <Button size="sm" className="mt-2 h-8 text-xs" onClick={handleInstall}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Install Now
              </Button>
            )}
          </div>
          <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
