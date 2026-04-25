import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "../shared/ui/app-shell";
import { AppErrorFallback } from "../shared/ui/app-error-boundary";
import { ProtectedRoute } from "./routes/route-guards";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate replace to="/experiments" />,
  },
  {
    path: "/login",
    lazy: async () => {
      const { LoginPage } = await import("../features/auth/login-page");
      return { Component: LoginPage };
    },
  },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    errorElement: <AppErrorFallback />,
    children: [
      {
        path: "/experiments",
        lazy: async () => {
          const { ExperimentListPage } = await import(
            "../features/experiments/experiment-list-page"
          );
          return { Component: ExperimentListPage };
        },
      },
      {
        path: "/experiments/new",
        lazy: async () => {
          const { ExperimentNewPage } = await import(
            "../features/experiments/experiment-new-page"
          );
          return { Component: ExperimentNewPage };
        },
      },
      {
        path: "/experiments/:experimentId",
        lazy: async () => {
          const { ExperimentDetailPage } = await import(
            "../features/experiments/experiment-detail-page"
          );
          return { Component: ExperimentDetailPage };
        },
      },
      {
        path: "/experiments/:experimentId/edit",
        lazy: async () => {
          const { ExperimentEditorPage } = await import(
            "../features/experiments/experiment-editor-page"
          );
          return { Component: ExperimentEditorPage };
        },
      },
      {
        path: "/experiments/:experimentId/files",
        lazy: async () => {
          const { ExperimentFilesPage } = await import(
            "../features/experiments/experiment-files-page"
          );
          return { Component: ExperimentFilesPage };
        },
      },
      {
        path: "/samples/:sampleId",
        lazy: async () => {
          const { SampleDetailPage } = await import("../features/samples/sample-detail-page");
          return { Component: SampleDetailPage };
        },
      },
      {
        path: "/admin/vocabularies",
        lazy: async () => {
          const { VocabularyAdminPage } = await import(
            "../features/vocabularies/vocabulary-admin-page"
          );
          return { Component: VocabularyAdminPage };
        },
      },
      {
        path: "*",
        lazy: async () => {
          const { NotFoundPage } = await import("../shared/ui/not-found-page");
          return { Component: NotFoundPage };
        },
      },
    ],
  },
]);
