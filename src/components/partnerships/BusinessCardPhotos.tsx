import { useEffect, useRef, useState } from 'react';
import {
  getBusinessCardPhotoUrl,
  uploadBusinessCardPhoto,
  type CardOwnerTable,
  type CardSide,
} from '@/lib/partnership-cards';

function Slot({
  side,
  label,
  path,
  table,
  recordId,
  onChanged,
}: {
  side: CardSide;
  label: string;
  path: string | null;
  table: CardOwnerTable;
  recordId: string;
  onChanged: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (path) {
      getBusinessCardPhotoUrl(path).then((u) => { if (!cancelled) setUrl(u); }).catch(() => undefined);
    } else {
      setUrl(null);
    }
    return () => { cancelled = true; };
  }, [path]);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      await uploadBusinessCardPhoto(table, recordId, side, file);
      onChanged();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1">
      <p className="mb-1 text-[11px] font-medium text-sparrow-gray">{label}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-sparrow-rule bg-sparrow-mist/30 hover:border-sparrow-green/50"
      >
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-sparrow-gray">{busy ? 'Uploading…' : '+ Add photo'}</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function BusinessCardPhotos({
  table,
  recordId,
  frontPath,
  backPath,
  onChanged,
}: {
  table: CardOwnerTable;
  recordId: string;
  frontPath: string | null;
  backPath: string | null;
  onChanged: () => void;
}) {
  return (
    <div>
      <span className="field-label">Business card</span>
      <div className="mt-1 flex gap-3">
        <Slot side="front" label="Front" path={frontPath} table={table} recordId={recordId} onChanged={onChanged} />
        <Slot side="back" label="Back" path={backPath} table={table} recordId={recordId} onChanged={onChanged} />
      </div>
    </div>
  );
}
