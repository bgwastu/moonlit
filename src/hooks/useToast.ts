import { useCallback, useRef, useState } from "react";

interface ToastState {
  message: React.ReactNode;
  visible: boolean;
  isCircular?: boolean;
}

interface UseToastReturn {
  toast: ToastState;
  showToast: (message: React.ReactNode, isCircular?: boolean) => void;
}

/**
 * Hook for managing toast notifications in the player.
 */
export function useToast(): UseToastReturn {
  const [toast, setToast] = useState<ToastState>({
    message: null,
    visible: false,
  });
  const toastTimeoutRef = useRef<NodeJS.Timeout>();

  const showToast = useCallback((message: React.ReactNode, isCircular?: boolean) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, visible: true, isCircular });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 1200);
  }, []);

  return { toast, showToast };
}
