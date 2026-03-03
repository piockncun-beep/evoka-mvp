import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { BrowserRouter as BR, Routes, Route } from "react-router-dom";
import Home from "./routes/Home";
import SignInPage from "./routes/SignInPage";
import SignUpPage from "./routes/SignUpPage";
import ProtectedAppLayout from "./routes/ProtectedAppLayout";
import Dashboard from "./routes/Dashboard";
import Feed from "./routes/Feed";
import Notifications from "./routes/Notifications";
import Profile from "./routes/Profile";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) throw new Error("Falta VITE_CLERK_PUBLISHABLE_KEY en el entorno (.env.local)");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <BR>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/sign-up/*" element={<SignUpPage />} />

          <Route element={<ProtectedAppLayout />}>
            <Route path="/app" element={<Dashboard />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </BR>
    </ClerkProvider>
  </StrictMode>
);
