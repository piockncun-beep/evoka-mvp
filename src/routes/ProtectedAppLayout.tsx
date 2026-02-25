import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";
import AppLayout from "./AppLayout";

export default function ProtectedAppLayout() {
  return (
    <>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
      <SignedIn>
        <AppLayout />
      </SignedIn>
    </>
  );
}
