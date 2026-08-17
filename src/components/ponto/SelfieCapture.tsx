import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Check } from "lucide-react";

interface SelfieCaptureProps {
  onCapture: (base64: string) => void;
  onCancel: () => void;
}

export function SelfieCapture({ onCapture, onCancel }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setCaptured(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch {
      setError("Não foi possível acessar a câmera frontal. Verifique as permissões.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopStream();
  }, [startCamera, stopStream]);

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext("2d")!;
    // Mirror horizontally for selfie
    ctx.translate(400, 0);
    ctx.scale(-1, 1);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 400, 400);

    const base64 = canvas.toDataURL("image/jpeg", 0.7);
    setCaptured(base64);
    stopStream();
  };

  const retake = () => {
    setCaptured(null);
    startCamera();
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <canvas ref={canvasRef} className="hidden" />

      {error && (
        <div className="text-sm text-destructive text-center p-4">{error}</div>
      )}

      {!captured && !error && (
        <>
          <div className="relative w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden bg-muted">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {!streaming && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera className="h-10 w-10 text-muted-foreground animate-pulse" />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Posicione seu rosto e tire uma selfie
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button onClick={takePhoto} disabled={!streaming} className="gap-2">
              <Camera className="h-4 w-4" />
              Tirar Foto
            </Button>
          </div>
        </>
      )}

      {captured && (
        <>
          <div className="w-full max-w-[280px] aspect-square rounded-2xl overflow-hidden border-2 border-primary">
            <img src={captured} alt="Selfie" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={retake} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Tirar outra
            </Button>
            <Button onClick={() => onCapture(captured)} className="gap-2">
              <Check className="h-4 w-4" />
              Confirmar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
