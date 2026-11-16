import type { JSX } from "react";
import { Route, Routes } from "react-router";
import { PublicOnly, RequireAuth } from "./auth/RouteGuards";
import { AppShell } from "./components/AppShell";
import { ChartPage } from "./pages/ChartPage";
import { QuotesPage } from "./pages/QuotesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RegisterPage } from "./pages/RegisterPage";

/**
 * Routes. Login and register are the only pages without a session; everything
 * else, the 404 page included, sits behind the guard. The settings page is added
 * with its feature (A4); until then that path falls through to the 404 page.
 */
export default function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<QuotesPage />} />
          <Route path="chart/:symbol?" element={<ChartPage />} />
          <Route path="history/:symbol?" element={<HistoryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
