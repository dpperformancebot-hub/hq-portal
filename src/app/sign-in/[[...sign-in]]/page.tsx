import { SignIn } from "@clerk/nextjs";

// M6 auth: Clerk sign-in. Only reachable in AUTH_MODE=clerk (the middleware
// redirects unauthenticated direct visits here). In gate-only mode this
// route sits behind the password gate and is unused.
export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
