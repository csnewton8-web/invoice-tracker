import { NextResponse } from "next/server";
import { HttpError } from "@/lib/auth";

export function handleRouteError(error: unknown, fallbackMessage = "Something went wrong") {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;

  console.error(fallbackMessage, error);

  return NextResponse.json(
    { error: process.env.NODE_ENV === "production" ? fallbackMessage : message },
    { status: 500 }
  );
}
