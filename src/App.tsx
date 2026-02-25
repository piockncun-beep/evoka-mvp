function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
      <h1 className="text-4xl font-semibold tracking-tight">EVOKA MVP</h1>
    </div>
  );
}

import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./routes/Home";
import SignInPage from "./routes/SignInPage";
import SignUpPage from "./routes/SignUpPage";
import ProtectedAppLayout from "./routes/ProtectedAppLayout";
import Dashboard from "./routes/Dashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />

        <Route path="/app" element={<ProtectedAppLayout />}>
          <Route index element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
