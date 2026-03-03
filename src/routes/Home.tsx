import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

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
          <SignInButton mode="modal">
            <button
              className="mt-4 px-6 py-3 rounded bg-white text-neutral-950 font-semibold text-lg shadow hover:bg-neutral-200 transition"
              type="button"
            >
              Iniciar sesión
            </button>
          </SignInButton>
        </div>
      </SignedOut>
    </>
  );
}
