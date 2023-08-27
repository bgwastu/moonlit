import { useEffect, useRef } from "react";

/**
 * Hook to manage an interval easily
 * @param handler - callback to be used in the setInterval function
 * @param ms - time in milliseconds
 * @param autoStart - Whether or not the interval will autostart
 */
export function useInterval(
    handler: Parameters<typeof setInterval>[number],
    ms: number,
    autoStart: boolean = true
) {
    const interval = useRef<NodeJS.Timeout>();
    const handlerRef = useRef(handler);

    useEffect(() => {
        if (!interval.current && autoStart) {
            interval.current = setInterval(handlerRef.current as any, ms);
        }
        return () => clear();
    }, [ms, autoStart]);

    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    const clear = () => {
        if (interval.current) {
            clearInterval(interval.current);
        }
    }

    const start = () => {
        interval.current = setInterval(handlerRef.current as any, ms);
    }

    return {
        clear,
        start
    }
}
