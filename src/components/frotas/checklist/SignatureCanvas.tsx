import { useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SignatureCanvasProps {
  onChange: (dataUrl: string) => void;
}

/** Canvas de assinatura com traço suave; emite dataURL PNG a cada traço concluído. */
export function SignatureCanvas({ onChange }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange("");
  };

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d")!;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawing.current = true;
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = getPoint(e);
    ctx.lineTo(p.x, p.y);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#17233F";
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0)) {
      setHasInk(true);
      onChange(canvas.toDataURL("image/png"));
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-[10px] border border-dashed border-border bg-surface">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="h-44 w-full touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          role="img"
          aria-label="Área de assinatura do condutor — desenhe com o dedo ou mouse"
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground/60">
            <PenLine className="h-4 w-4" /> Assine aqui
          </span>
        )}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={clear} className={cn("text-muted-foreground", !hasInk && "invisible")}>
        <Eraser className="h-4 w-4" /> Limpar
      </Button>
    </div>
  );
}
