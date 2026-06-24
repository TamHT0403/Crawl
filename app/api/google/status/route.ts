import { NextResponse } from "next/server";
import { getGoogleStatus } from "@/lib/googleDocs";

export async function GET() {
  return NextResponse.json(await getGoogleStatus());
}
