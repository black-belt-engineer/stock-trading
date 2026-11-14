import type { JSX } from "react";
import { Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { ChartPage } from "./pages/ChartPage";
import { QuotesPage } from "./pages/QuotesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { NotFoundPage } from "./pages/NotFoundPage";

/**
 * Routes. The settings page is added with its feature (A4); until then that
 * path falls through to the 404 page.
 */
export default function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<QuotesPage />} />
        <Route path="chart/:symbol?" element={<ChartPage />} />
        <Route path="history/:symbol?" element={<HistoryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
