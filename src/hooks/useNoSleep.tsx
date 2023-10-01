import NoSleep from "nosleep.js";
import { useEffect, useMemo, useState } from "react";

export default function useNoSleep() {
  const [enabled, setEnabled] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  let noSleep = useMemo(() => {
    if (!isMounted) {
      return null;
    }

    return new NoSleep();
  }, [isMounted]);

  useEffect(() => {
    setIsMounted(true);

    if (noSleep == null) {
      return;
    }

    if (enabled) {
      noSleep.enable();
    } else {
      noSleep.disable();
    }

    return function cleanup() {
      if (noSleep == null) {
        return;
      }

      if (enabled) {
        noSleep.disable();
      }
    };
  }, [enabled, noSleep]);

  return [enabled, setEnabled] as const;
}
