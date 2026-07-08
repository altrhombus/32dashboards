import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./hooks/useSession.js";
import { LoginPage } from "./routes/LoginPage.js";
import { EventsPage } from "./routes/EventsPage.js";
import { EventEditPage } from "./routes/EventEditPage/index.js";
import "./App.css";

function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSession();
  if (status === "loading") return <div className="admin-loading">Loading…</div>;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/events"
          element={
            <RequireAuth>
              <div className="admin-shell">
                <EventsPage />
              </div>
            </RequireAuth>
          }
        />
        <Route
          path="/events/:id"
          element={
            <RequireAuth>
              <div className="admin-shell">
                <EventEditPage />
              </div>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/events" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
