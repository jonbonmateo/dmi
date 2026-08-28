import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { ForgotPasswordForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  // A signed-in browser has no reason to be here; send it to the app.
  if (await getAuth()) redirect("/mode");
  return (
    <main className="flex min-h-screen items-center justify-center p-6 sm:p-12">
      <ForgotPasswordForm />
    </main>
  );
}
