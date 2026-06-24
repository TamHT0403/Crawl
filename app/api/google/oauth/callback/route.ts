import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleGoogleOAuthCallback } from "@/lib/googleDocs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const baseUrl = `${url.protocol}//${url.host}`;

  if (error) {
    return NextResponse.redirect(`${baseUrl}/reports?google=error&message=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/reports?google=error&message=${encodeURIComponent("Thiếu mã xác thực Google OAuth.")}`);
  }

  // State check: nếu có state cookie thì verify, nếu không thì vẫn cho qua
  // (trường hợp user click auth URL trực tiếp từ status response)
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("kolia_google_oauth_state")?.value;
  if (state && expectedState && state !== expectedState) {
    return NextResponse.redirect(`${baseUrl}/reports?google=error&message=${encodeURIComponent("State OAuth không hợp lệ.")}`);
  }

  try {
    await handleGoogleOAuthCallback(code);

    // Return HTML page that auto-closes the popup
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Kết nối YouTube</title></head>
<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f7faf8;font-family:system-ui,sans-serif">
<div style="text-align:center;padding:2rem">
  <div style="font-size:3rem;margin-bottom:1rem">✅</div>
  <h2 style="margin:0;color:#102033">Đã kết nối YouTube thành công!</h2>
  <p style="color:#6b7280;margin-top:0.5rem">Cửa sổ này sẽ tự động đóng...</p>
</div>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: "youtube-oauth-success" }, "*");
    setTimeout(() => window.close(), 1500);
  } else {
    setTimeout(() => { window.location.href = "/settings"; }, 2000);
  }
</script>
</body></html>`;

    const response = new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    response.cookies.set("kolia_google_oauth_state", "", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/"
    });
    return response;
  } catch (errorValue) {
    const message = errorValue instanceof Error ? errorValue.message : "Không thể kết nối Google OAuth.";
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Lỗi kết nối</title></head>
<body style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef2f2;font-family:system-ui,sans-serif">
<div style="text-align:center;padding:2rem">
  <div style="font-size:3rem;margin-bottom:1rem">❌</div>
  <h2 style="margin:0;color:#991b1b">Lỗi kết nối YouTube</h2>
  <p style="color:#dc2626;margin-top:0.5rem">${message}</p>
  <a href="/settings" style="display:inline-block;margin-top:1rem;padding:0.5rem 1.5rem;background:#102033;color:white;border-radius:8px;text-decoration:none">Quay lại Settings</a>
</div>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: "youtube-oauth-error", error: "${message}" }, "*");
    setTimeout(() => window.close(), 3000);
  }
</script>
</body></html>`;
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
