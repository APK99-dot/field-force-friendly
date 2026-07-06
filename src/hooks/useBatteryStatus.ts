import { useEffect, useState } from "react";

interface BatteryState {
  level: number | null; // 0-100
  charging: boolean;
  supported: boolean;
}

/**
 * Reads the device battery status via the Web Battery API.
 * Works inside the Android APK (WebView) and Chromium-based browsers.
 */
export function useBatteryStatus(): BatteryState {
  const [state, setState] = useState<BatteryState>({
    level: null,
    charging: false,
    supported: typeof navigator !== "undefined" && "getBattery" in navigator,
  });

  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<any>;
    };
    if (!nav.getBattery) return;

    let battery: any;
    let mounted = true;

    const update = () => {
      if (!mounted || !battery) return;
      setState({
        level: Math.round(battery.level * 100),
        charging: battery.charging,
        supported: true,
      });
    };

    nav.getBattery().then((b) => {
      if (!mounted) return;
      battery = b;
      update();
      battery.addEventListener("levelchange", update);
      battery.addEventListener("chargingchange", update);
    });

    return () => {
      mounted = false;
      if (battery) {
        battery.removeEventListener("levelchange", update);
        battery.removeEventListener("chargingchange", update);
      }
    };
  }, []);

  return state;
}
