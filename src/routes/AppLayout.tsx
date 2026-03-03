import { NavLink, Outlet } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";

export default function AppLayout() {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1 rounded ${isActive ? "bg-neutral-700 text-white" : "text-neutral-300 hover:text-white"}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">EVOKA MVP</h1>
          <nav className="flex items-center gap-2">
            <NavLink to="/app" end className={navClass}>
              Dashboard/Memories
            </NavLink>
            <NavLink to="/feed" className={navClass}>
              Feed
            </NavLink>
            <NavLink to="/notifications" className={navClass}>
              Notifications
            </NavLink>
          </nav>
        </div>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
