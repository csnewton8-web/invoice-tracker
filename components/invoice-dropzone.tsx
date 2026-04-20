"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Props = {
  onUploaded?: () => Promise<void> | void;
};

export function InvoiceDropzone({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const supabase = createClient();

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const pdfFiles = Array.from(fileList).filter(
      (file) =>
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
    );

    if (!pdfFiles.length) {
      setMessage("Please drop or select PDF invoices only.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("You must be logged in to upload invoices.");
      }

      for (const file of pdfFiles) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/invoices/create", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        });

        const body = await res.json();

        if (!res.ok) {
          throw new Error(body.error || "Upload failed");
        }
      }

      if (onUploaded) {
        await onUploaded();
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      setMessage("Upload complete");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
      setDragActive(false);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!loading) setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (loading) return;

    uploadFiles(e.dataTransfer.files);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
        dragActive
          ? "border-slate-900 bg-slate-100"
          : "border-slate-300 bg-white"
      }`}
    >
      <h2 className="text-xl font-semibold">Drop it like it&apos;s hot</h2>

      <p className="mt-2 text-sm text-slate-600">
        Drag and drop PDF invoices here from your computer or email, or use the
        button below.
      </p>

      <button
        type="button"
        className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-white"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? "Uploading..." : "Select PDFs"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => uploadFiles(e.target.files)}
      />

      {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
    </div>
  );
}