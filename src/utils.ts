export const getSongLength = (bufferDuration: number, playbackRate: number) => {
  return bufferDuration / playbackRate;
};