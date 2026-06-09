"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type UploadedInvoice = {
  id: string;
  supplier?: string | null;
  invoice_number?: string | null;
  po_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  total?: number | null;
  currency?: string | null;
  is_paid?: boolean | null;
  notes?: string[] | null;
};

type Props = {
  uploading?: boolean;
  onUploadStart?: () => void;
  onUploaded?: (invoice?: UploadedInvoice) => void | Promise<void>;
  onUploadError?: (message: string) => void;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InvoiceDropzone({
  onUploadStart,
  onUploaded,
  onUploadError,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const supabase = createClient();

  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileSize, setSelectedFileSize] = useState("");
  const [statusText, setStatusText] = useState("");
  const [progress, setProgress] = useState(0);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    let timer: number | undefined;

    if (busy) {
      timer = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 92) return prev;
          return prev + Math.max(1, Math.round((100 - prev) / 8));
        });
      }, 450);
    }

    return () => {
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [busy]);

  function resetLocalState() {
    setBusy(false);
    setStatusText("");
    setSelectedFileName("");
    setSelectedFileSize("");
    setProgress(0);
  }

  async function uploadFile(file: File) {
    setLocalError("");

    if (!file) return;

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      const message = "Only PDF files can be uploaded.";
      setLocalError(message);
      onUploadError?.(message);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const message = "PDF is too large. Maximum upload size is 10 MB.";
      setLocalError(message);
      onUploadError?.(message);
      return;
    }

    setBusy(true);
    setSelectedFileName(file.name);
    setSelectedFileSize(formatFileSize(file.size));
    setProgress(8);
    setStatusText("Preparing invoice upload…");
    onUploadStart?.();

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("You must be logged in to upload invoices.");
      }

      const formData = new FormData();
      formData.append("file", file);

      setProgress(18);
      setStatusText("Uploading PDF securely…");

      const res = await fetch("/api/invoices/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await res.json()
        : { error: await res.text() };

      if (!res.ok) {
        throw new Error(body.error || "Invoice upload failed.");
      }

      setProgress(96);
      setStatusText("Finalising workspace update…");

      await onUploaded?.(body.invoice);

      setProgress(100);
      setStatusText("Upload complete");

      window.setTimeout(() => {
        resetLocalState();
      }, 500);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Invoice upload failed.";

      setLocalError(message);
      setStatusText("");
      setProgress(0);
      setBusy(false);
      onUploadError?.(message);
    }
  }

  async function handleInputChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    await uploadFile(file);
    event.target.value = "";
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(false);

    if (busy) return;

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    await uploadFile(file);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!busy) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  return (
    <div className="rounded-[30px] border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/10">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200">
            New invoice
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">
            Upload supplier invoices into FlashFox
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Drop in a PDF and FlashFox will extract the key invoice data and
            place it into your workspace for review.
          </p>
        </div>

        <div className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-medium text-slate-300">
          PDF only • Up to 10 MB
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleInputChange}
        className="hidden"
      />

      <div
        onClick={() => {
          if (!busy) {
            inputRef.current?.click();
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={[
          "cursor-pointer rounded-[28px] border-2 border-dashed p-8 text-center transition-all duration-200",
          busy
            ? "border-emerald-400/50 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
            : isDragging
            ? "border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
            : "border-slate-700 bg-slate-950/60 hover:border-emerald-400/60 hover:bg-emerald-500/5 hover:shadow-lg hover:shadow-emerald-500/10",
        ].join(" ")}
      >
        <div className="mx-auto max-w-2xl">
          <div className="text-xl font-semibold text-white">
            {busy
              ? "Uploading and processing your invoice…"
              : "Drop a PDF invoice here or click to browse"}
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            Keep supplier invoices organised, editable, and easy to review with
            the original PDF always close at hand.
          </p>

          {!busy ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-slate-200"
            >
              Choose PDF
            </button>
          ) : null}
        </div>
      </div>

      {selectedFileName ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
          Selected file:{" "}
          <span className="font-medium text-white">{selectedFileName}</span>
          {selectedFileSize ? (
            <span className="ml-2 text-slate-500">({selectedFileSize})</span>
          ) : null}
        </div>
      ) : null}

      {busy ? (
        <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-200">
                {statusText || "Uploading invoice…"}
              </div>
              {selectedFileName ? (
                <div className="mt-1 text-xs text-slate-500">
                  {selectedFileName}
                </div>
              ) : null}
            </div>
            <div className="text-sm font-medium text-slate-400">
              {progress}%
            </div>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Please keep this tab open while the file is uploaded and processed.
          </p>
        </div>
      ) : null}

      {localError ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          {localError}
        </div>
      ) : null}

      {!busy ? (
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1">
            Faster supplier tracking
          </span>
          <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1">
            Cleaner invoice review
          </span>
          <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1">
            Secure PDF storage
          </span>
        </div>
      ) : null}
    </div>
  );
}