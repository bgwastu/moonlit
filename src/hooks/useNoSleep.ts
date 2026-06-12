import { useCallback, useEffect, useRef, useState } from "react";
import NoSleep from "nosleep.js";

export default function useNoSleep(): [
  boolean,
  { enable: () => void; disable: () => void },
] {
  const noSleepRef = useRef<NoSleep | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    noSleepRef.current = new NoSleep();
    return () => {
      noSleepRef.current?.disable();
    };
  }, []);

  const enable = useCallback(() => {
    noSleepRef.current?.enable();
    setEnabled(true);
  }, []);

  const disable = useCallback(() => {
    noSleepRef.current?.disable();
    setEnabled(false);
  }, []);

  return [enabled, { enable, disable }];
}
