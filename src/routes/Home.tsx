import { SignedIn, SignedOut, Navigate } from "@clerk/clerk-react";

export default function Home() {
  return (
    <>
      <SignedIn>
        <Navigate to="/app" />
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 text-white">
          <h1 className="text-4xl font-semibold mb-6">Bienvenido a EVOKA MVP</h1>
          <p className="mb-4">Inicia sesión para acceder al dashboard.</p>
        </div>
      </SignedOut>
    </>
  );
}
