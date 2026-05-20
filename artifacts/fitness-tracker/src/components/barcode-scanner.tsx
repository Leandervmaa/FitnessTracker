import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const detectedRef = useRef(false);

  useEffect(() => {
    if (!mountRef.current) return;

    const scanner = new Html5Qrcode("barcode-scanner-div");
    scannerRef.current = scanner;

    const startScanning = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" }, // rear camera
          {
            fps: 15,
            qrbox: { width: 280, height: 180 },
            aspectRatio: 1.5,
            disableFlip: false,
          },
          (decodedText) => {
            // Prevent multiple callbacks
            if (detectedRef.current) return;
            detectedRef.current = true;

            // Stop and notify
            scanner.stop().catch(() => {}).finally(() => {
              onDetected(decodedText);
            });
          },
          () => { /* scan errors are normal – ignore */ }
        );
        setStarted(true);
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes("permission") || msg.includes("NotAllowed")) {
          setError("Camera toegang geweigerd. Sta camera-toegang toe in de browserinstellingen.");
        } else {
          setError("Camera kon niet worden gestart. Probeer het opnieuw.");
        }
      }
    };

    startScanning();

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleClose = () => {
    if (scannerRef.current?.isScanning) {
      scannerRef.current.stop().catch(() => {});
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <div className="flex items-center gap-2 text-white">
          <ScanBarcode className="h-5 w-5 text-primary" />
          <span className="font-bold text-sm">Scan barcode</span>
        </div>
        <button onClick={handleClose} className="text-white p-1">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Scanner area */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* Camera viewfinder */}
        <div
          id="barcode-scanner-div"
          ref={mountRef}
          className="w-full max-w-md"
          style={{ maxHeight: "60vh" }}
        />

        {/* Overlay guide */}
        {started && !error && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Corner markers */}
            <div className="relative w-72 h-44">
              {/* Top-left */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-md" />
              {/* Top-right */}
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-md" />
              {/* Bottom-left */}
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-md" />
              {/* Bottom-right */}
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-md" />
              {/* Scan line */}
              <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-primary/70 animate-pulse" />
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="px-6 text-center space-y-4">
            <div className="text-white/80 text-sm">{error}</div>
            <Button variant="outline" onClick={handleClose} className="text-white border-white">
              Sluiten
            </Button>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {started && !error && (
        <div className="px-4 py-4 text-center bg-black/80">
          <p className="text-white/60 text-xs">Richt de camera op de streepjescode van het product</p>
        </div>
      )}
    </div>
  );
}
