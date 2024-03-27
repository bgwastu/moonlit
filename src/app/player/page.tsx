"use client";

import { Player } from "@/components/Player";
import { songAtom } from "@/state";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Page() {
  const [song] = useAtom(songAtom);
  const router = useRouter();

  useEffect(() => {
    if (!song) {
      router.replace("/");
    }
  }, [song, router]);

  if (song) {
    return <Player song={song} repeating={false}/>;
  }

  return <></>;
}
