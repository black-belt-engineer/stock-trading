import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { KcPage } from "./kc.gen";

// To look at one page with `pnpm dev`, uncomment this block and name the page.
// Comment it out again: it would otherwise ship in the bundle.
/*
import { getKcContextMock } from "./login/KcPageStory";

if (import.meta.env.DEV) {
  window.kcContext = getKcContextMock({
    pageId: "register.ftl",
    overrides: {}
  });
}
*/

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html has no #root element");

createRoot(rootElement).render(
  <StrictMode>
    {window.kcContext ? (
      <KcPage kcContext={window.kcContext} />
    ) : (
      <h1>No Keycloak Context</h1>
    )}
  </StrictMode>
);
