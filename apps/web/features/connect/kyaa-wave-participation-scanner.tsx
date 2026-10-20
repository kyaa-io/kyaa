"use client";
import { useEffect, useRef, useState } from "react";
import type QrScanner from "qr-scanner";
import { Camera, ImagePlus, ScanLine } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { participationScannerCopy } from "./kyaa-wave-participation-copy";
import { participationQrCode } from "./kyaa-wave-participation";
import styles from "./kyaa-wave-participation-screen.module.css";

export function ParticipationScanner({ locale, onScan }: { locale: AppLocale; onScan: (token: string) => void }) {
  const copy = participationScannerCopy[locale], video = useRef<HTMLVideoElement>(null), upload = useRef<HTMLInputElement>(null);
  const [attempt, setAttempt] = useState(0), [problem, setProblem] = useState(""), [active, setActive] = useState(false);
  const callback = useRef(onScan), mounted = useRef(true), accepted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { callback.current = onScan; }, [onScan]);
  useEffect(() => {
    let disposed = false, scanner: QrScanner | undefined;
    void (async () => {
      try {
        const { default: Scanner } = await import("qr-scanner");
        if (disposed || !video.current) return;
        scanner = new Scanner(video.current, result => {
          if (disposed || accepted.current) return;
          const token = participationQrCode(result.data, location.origin);
          if (!token) { setProblem(copy.invalid); return; }
          accepted.current = true; scanner?.stop(); callback.current(token);
        }, { preferredCamera: "environment", maxScansPerSecond: 5, returnDetailedScanResult: true });
        await scanner.start();
        if (disposed) scanner.destroy(); else setActive(true);
      } catch { if (!disposed) { setProblem(copy.cameraError); setActive(false); } }
    })();
    return () => { disposed = true; scanner?.destroy(); };
  }, [attempt, copy.cameraError, copy.invalid]);
  async function scanImage(file?: File) {
    if (!file) return;
    setProblem("");
    try {
      if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) throw new Error();
      const { default: Scanner } = await import("qr-scanner");
      const result = await Scanner.scanImage(file, { returnDetailedScanResult: true });
      const token = participationQrCode(result.data, location.origin);
      if (!token) throw new Error();
      if (mounted.current && !accepted.current) { accepted.current = true; callback.current(token); }
    } catch { if (mounted.current) setProblem(copy.invalid); }
  }
  return <div className={styles.scanner}>
    <p className={styles.meta}>{copy.hint}</p>
    <div className={styles.viewfinder} data-active={active}><video ref={video} muted playsInline aria-label={copy.scan} /><ScanLine size={88} strokeWidth={1} aria-hidden="true" /></div>
    {problem && <p role="alert" className={styles.error}>{problem}</p>}
    {!active && <FanAction leadingIcon={<Camera size={20} />} onClick={() => { setProblem(""); setAttempt(value => value + 1); }}>{copy.camera}</FanAction>}
    <input ref={upload} type="file" accept="image/*" hidden aria-label={copy.upload} onChange={event => { void scanImage(event.target.files?.[0]); event.target.value = ""; }} />
    <FanAction variant="text" leadingIcon={<ImagePlus size={20} />} onClick={() => upload.current?.click()}>{copy.upload}</FanAction>
  </div>;
}
