import type { JSX } from "react";
import { Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { QuotesPage } from "./pages/QuotesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { NotFoundPage } from "./pages/NotFoundPage";

/**
 * Routes. Pages for chart and settings are added with their features (M4, A4);
 * until then those paths fall through to the 404 page.
 */
export default function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<QuotesPage />} />
        <Route path="history/:symbol?" element={<HistoryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
