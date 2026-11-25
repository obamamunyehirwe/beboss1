import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import "../beboss/styles.css";
import "../beboss/redesign.css";

const BeBossDesktopApp = lazy(() => import("../beboss/App"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BeBoss Desktop — Retail Operations Command Center" },
      {
        name: "description",
        content: "Offline-first retail POS, inventory control, customer credit, multi-branch management, and encrypted cloud sync in one modern desktop workspace.",
      },
      { property: "og:title", content: "BeBoss Desktop — Retail Operations Command Center" },
      {
        property: "og:description",
        content: "Offline-first retail POS, inventory control, customer credit, multi-branch management, and encrypted cloud sync in one modern desktop workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function BootFallback() {
  return (
    <div className="setup-loading">
      <span>Preparing BeBoss Desktop…</span>
    </div>
  );
}

function Index() {
  return (
    <ClientOnly fallback={<BootFallback />}>
      <Suspense fallback={<BootFallback />}>
        <BeBossDesktopApp />
      </Suspense>
    </ClientOnly>
  );
}
