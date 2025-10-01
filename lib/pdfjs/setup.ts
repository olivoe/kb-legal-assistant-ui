"use client";

import { GlobalWorkerOptions } from "pdfjs-dist";

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

// Pin explicit CDN assets to avoid “no worker” / font warnings.
const VERSION = "4.7.76";
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build/pdf.worker.min.js`;

// Standard fonts URL (silences font-not-found noise)
if (typeof window !== "undefined") {
  (window as any).pdfjsLib = (window as any).pdfjsLib || {};
  (window as any).pdfjsLib.GlobalStandardFontDataUrl =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/standard_fonts/`;
}