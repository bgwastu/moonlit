import { useCallback, useEffect, useRef, useState } from "react";

/** Screen wake lock hook using Wake Lock API with NoSleep.js fallback */
export default function useNoSleep() {
  const [enabled, setEnabledState] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const noSleepRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !noSleepRef.current) {
      import("nosleep.js").then((NoSleep) => {
        noSleepRef.current = new NoSleep.default();
      });
    }
  }, []);

  const enable = useCallback(async () => {
    if ("wakeLock" in navigator) {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        wakeLockRef.current = sentinel;
        setEnabledState(true);

        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
            setEnabledState(false);
          }
        });
        return;
      } catch (err) {
        console.warn("Wake Lock API failed, falling back to NoSleep.js", err);
      }
    }

    try {
      if (noSleepRef.current) {
        await noSleepRef.current.enable();
        setEnabledState(true);
      }
    } catch (err) {
      console.error("NoSleep.js failed", err);
    }
  }, []);

  const disable = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(console.error);
      wakeLockRef.current = null;
    }
    if (noSleepRef.current) {
      noSleepRef.current.disable();
    }
    setEnabledState(false);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && enabled && !wakeLockRef.current) {
        if ("wakeLock" in navigator) {
          try {
            wakeLockRef.current = await navigator.wakeLock.request("screen");
          } catch {}
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
      if (noSleepRef.current) noSleepRef.current.disable();
    };
  }, [enabled]);

  return [enabled, { enable, disable }] as const;
}
