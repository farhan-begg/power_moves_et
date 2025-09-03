import React, { useEffect, useRef, useState } from "react";
// npm i hls.js
import Hls from "hls.js";

type VideoCardProps = {
  src: string;         // direct .mp4/.webm OR .m3u8
  caption?: string;
  poster?: string;
};

export function VideoCard({ src, caption = "", poster }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isHls = src.endsWith(".m3u8");

  useEffect(() => {
    setError(null);

    const video = videoRef.current;
    if (!video) return;

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, data) => {
          setError(`HLS error: ${data?.details || "unknown error"}`);
        });
        return () => hls.destroy();
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari iOS
        video.src = src;
      } else {
        setError("This browser can’t play HLS and hls.js isn’t supported.");
      }
    } else {
      // Non-HLS: rely on native playback (mp4/webm/ogg)
      video.src = src;
    }
  }, [src, isHls]);

  return (
<figure className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/5" data-reveal>
  <video
    ref={videoRef}
    autoPlay
    loop
    muted
    playsInline
    poster={poster}
    className="absolute inset-0 w-full h-full object-cover"
    onError={() => setError("Browser couldn’t load or play the video source.")}
  />
  {/* optional caption overlay */}
  {caption && (
    <figcaption className="absolute bottom-0 p-3 text-xs text-white/70 bg-black/40 w-full">
      {caption}
    </figcaption>
  )}
</figure>

  );
}
