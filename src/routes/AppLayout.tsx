import { Outlet } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-neutral-800">
        <h1 className="text-2xl font-semibold">EVOKA MVP</h1>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
