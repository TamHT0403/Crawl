import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getGoogleAuthUrl, getGoogleConfig } from "@/lib/googleDocs";

export async function GET() {
  const config = await getGoogleConfig();
  if (!config.configured) {
    const params = new URLSearchParams({
      google: "missing-config",
      missing: config.missingEnv.join(",")
    });
    return NextResponse.redirect(new URL(`/reports?${params.toString()}`, config.redirectUri));
  }

  const state = randomUUID();
  const authUrl = await getGoogleAuthUrl(state);
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("kolia_google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/"
  });
  return response;
}
