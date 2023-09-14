import { useEffect, useRef, useState } from 'react';
import { clearInterval, setInterval } from 'worker-timers';

export function useInterval(fn: () => void, interval: number) {
  const [active, setActive] = useState(false);
  const intervalRef = useRef<number>();
  const fnRef = useRef<() => void>();

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const start = () => {
    setActive((old) => {
      if (!old && !intervalRef.current) {
        intervalRef.current = setInterval(fnRef.current!, interval);
        window.setInterval
      }
      return true;
    });
  };
  
  const stop = () => {
    if(intervalRef.current){
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    setActive(false);
  };
  
  const toggle = () => {
    if (active) {
      stop();
    } else {
      start();
    }
  };

  return { start, stop, toggle, active };
}