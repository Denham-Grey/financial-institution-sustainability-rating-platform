import { auth } from "@/lib/auth/server";

export default auth.middleware({
  loginUrl: "/sign-in",
  publicRoutes: ["/sign-in", "/verify", "/api/health"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|og.png).*)"],
};
