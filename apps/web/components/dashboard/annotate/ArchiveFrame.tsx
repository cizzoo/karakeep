"use client";

import { forwardRef } from "react";

const ArchiveFrame = forwardRef<
  HTMLIFrameElement,
  {
    src: string;
    title: string;
    onLoad: () => void;
  }
>(function ArchiveFrame({ src, title, onLoad }, ref) {
  return (
    <iframe
      ref={ref}
      // allow-same-origin only: this lets the parent read/decorate
      // contentDocument, but the archived page can never run scripts, submit
      // forms, open popups, or navigate the top-level window. Never add
      // allow-scripts alongside allow-same-origin -- that combination would
      // let the archived page escape the sandbox and act as our own origin.
      sandbox="allow-same-origin"
      src={src}
      title={title}
      className="h-full w-full border-0 bg-white"
      onLoad={onLoad}
    />
  );
});

export default ArchiveFrame;
