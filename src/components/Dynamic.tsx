import { useEffect, useState } from "react";

export default function Dynamic({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready)
    return <div style={{ backgroundColor: "#1A1B1E", height: "100dvh", width: "100%" }}></div>;

  return <>{children}</>;
}
