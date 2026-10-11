import { SignUp } from "@clerk/nextjs";

// M6 auth: Clerk sign-up (first-time account creation). Only reachable in
// AUTH_MODE=clerk; the middleware marks /sign-up public alongside /sign-in.
// New users land on /dashboard, where getServerIdentity claims their invite
// (by email) and creates the users row with the right role.
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <SignUp fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
