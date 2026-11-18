import type { JSX } from "react";
import { Route, Routes } from "react-router";
import { AuthEntry, RequireAuth } from "./auth/RouteGuards";
import { AppShell } from "./components/AppShell";
import { ChartPage } from "./pages/ChartPage";
import { QuotesPage } from "./pages/QuotesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SettingsPage } from "./pages/SettingsPage";

/**
 * Routes. `/login` and `/register` only redirect to the BFF's login (Keycloak shows the
 * pages); everything else, the 404 page included, sits behind the guard.
 */
export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="login" element={<AuthEntry />} />
      <Route path="register" element={<AuthEntry register />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<QuotesPage />} />
          <Route path="chart/:symbol?" element={<ChartPage />} />
          <Route path="history/:symbol?" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
