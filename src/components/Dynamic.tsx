import { useEffect, useState } from "react";

export default function Dynamic({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) return <></>;

  return <>{children}</>;
}
