import { useState, useRef, useEffect, useCallback } from "react";

interface PhotoSourcePickerProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps a trigger element (e.g. an "add photo" button) and shows a menu
 * to choose between camera capture and gallery/file picker.
 */
export function PhotoSourcePicker({ onFiles, multiple = false, children }: PhotoSourcePickerProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onFiles(files);
    e.target.value = "";
    setOpen(false);
  };

  return (
    <div className="photo-source-picker" ref={menuRef}>
      <div onClick={() => setOpen(!open)}>{children}</div>
      {open && (
        <div className="photo-source-menu">
          <button type="button" className="photo-source-option" onClick={() => cameraRef.current?.click()}>
            📷 Take Photo
          </button>
          <button type="button" className="photo-source-option" onClick={() => galleryRef.current?.click()}>
            🖼️ Choose from Gallery
          </button>
        </div>
      )}
      <input ref={galleryRef} type="file" accept="image/*" multiple={multiple} onChange={handleFileChange} style={{ display: "none" }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: "none" }} />
    </div>
  );
}
