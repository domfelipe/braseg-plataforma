import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_PHOTOS = 5;
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DIM = 1280;

interface PhotoCaptureProps {
  photos: File[];
  onChange: (files: File[]) => void;
}

async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_SIZE) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
  bitmap.close();
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

/** Seleção de até 5 fotos com compressão client-side (alvo ≤5MB). */
export function PhotoCapture({ photos, onChange }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      const incoming = Array.from(list).slice(0, MAX_PHOTOS - photos.length);
      const processed: File[] = [];
      for (const f of incoming) {
        processed.push(await compressImage(f));
      }
      const next = [...photos, ...processed].slice(0, MAX_PHOTOS);
      setPreviews(next.map((f) => URL.createObjectURL(f)));
      onChange(next);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (index: number) => {
    const next = photos.filter((_, i) => i !== index);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {previews.map((url, i) => (
          <div key={i} className="group relative h-24 w-24 overflow-hidden rounded-[10px] border border-border">
            <img src={url} alt={"Foto " + (i + 1) + " da inspeção"} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label="Remover foto"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <Camera className="h-5 w-5" />
            <span className="text-[10px] font-medium">{busy ? "..." : "Adicionar"}</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      <p className="text-xs text-muted-foreground">Até {MAX_PHOTOS} fotos · compressão automática acima de 5MB</p>
    </div>
  );
}
