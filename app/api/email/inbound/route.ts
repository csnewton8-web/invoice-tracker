import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const event = await req.json();

    console.log("Inbound email event:", JSON.stringify(event, null, 2));

    return NextResponse.json({
      success: true,
      received: true,
      type: event?.type || null,
      dataKeys: event?.data ? Object.keys(event.data) : [],
    });
  } catch (error) {
    console.error("Inbound email webhook error:", error);

    return NextResponse.json(
      { error: "Inbound webhook failed" },
      { status: 500 }
    );
  }
}