import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { isMobileApp } from "./bridge";
import "@xyflow/react/dist/style.css";
import "./style.css";

if (isMobileApp) {
  document.documentElement.classList.add("mobile-app");
  const viewport = window.visualViewport;
  const resize = () => {
    if (viewport)
      document.documentElement.style.setProperty(
        "--app-height",
        `${viewport.height}px`,
      );
  };
  viewport?.addEventListener("resize", resize);
  resize();
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
