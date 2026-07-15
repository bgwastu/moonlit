"use client";

import { Player } from "@/components/Player";
import { useAppContext } from "@/context/AppContext";

/**
 * Layout-level player host. Stays mounted across Home <-> Player URL soft-replaces
 * so Web Audio / stretch playback is not torn down when collapsing to the mini bar.
 */
export function PlayerHost() {
  const {
    playerMode,
    playerUrl,
    media,
    playerAutoPlay,
    collapsePlayer,
    expandPlayer,
    closePlayer,
  } = useAppContext();

  if (playerMode === "hidden" && !playerUrl && !media) return null;

  return (
    <Player
      url={playerUrl ?? undefined}
      mode={playerMode === "hidden" ? "expanded" : playerMode}
      autoPlay={playerAutoPlay}
      onRequestCollapse={collapsePlayer}
      onRequestExpand={expandPlayer}
      onRequestClose={closePlayer}
    />
  );
}
