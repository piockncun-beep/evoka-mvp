import { SignedIn, SignedOut, Navigate } from "@clerk/clerk-react";

export default function Dashboard() {
  return (
    <>
      <SignedOut>
        <Navigate to="/sign-in" />
      </SignedOut>
      <SignedIn>
        <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-white">
          <h2 className="text-3xl font-bold mb-4">Dashboard</h2>
          <p>¡Has iniciado sesión correctamente!</p>
        </div>
      </SignedIn>
    </>
  );
}
