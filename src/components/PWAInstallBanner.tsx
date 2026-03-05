import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Already installed as standalone
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Dismissed recently
    const dismissedAt = localStorage.getItem("pwa-banner-dismissed");
    if (dismissedAt && Date.now() - Number(dismissedAt) < 24 * 60 * 60 * 1000) return;

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);

    if (ios) {
      setShowBanner(true);
      return;
    }

    // Check if prompt was already captured globally before this component mounted
    if (window.__deferredPWAPrompt) {
      setDeferredPrompt(window.__deferredPWAPrompt);
      setShowBanner(true);
    }

    // Also listen for the event in case it fires after mount
    const handler = (e: Event) => {
      e.preventDefault();
      const prompt = e as BeforeInstallPromptEvent;
      window.__deferredPWAPrompt = prompt;
      setDeferredPrompt(prompt);
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Fallback: show banner after 3s even without the prompt (for browsers that don't support it)
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
    // Re-read from global in case state missed it
    const prompt = deferredPrompt || window.__deferredPWAPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setShowBanner(false);
    setDeferredPrompt(null);
    window.__deferredPWAPrompt = undefined;
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("pwa-banner-dismissed", String(Date.now()));
  };

  if (!showBanner) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.1)] p-4"
      >
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-foreground" />
              <span className="text-sm font-semibold text-foreground">Install App</span>
            </div>
            <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1">
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            {isIOS
              ? "Tap the Share button, then 'Add to Home Screen' for a better experience"
              : "Install this app for a better experience"}
          </p>

          <div className="flex items-center gap-2">
            <Button
              className="flex-1 h-11 text-sm font-semibold"
              onClick={deferredPrompt || window.__deferredPWAPrompt ? handleInstall : handleDismiss}
            >
              <Download className="h-4 w-4 mr-2" />
              Install Now
            </Button>
            <Button
              variant="outline"
              className="h-11 text-sm font-medium shrink-0"
              onClick={handleDismiss}
            >
              Maybe Later
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
