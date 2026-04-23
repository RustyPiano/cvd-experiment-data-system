/* eslint-disable react-refresh/only-export-components */
import { createBrowserRouter, Navigate } from "react-router-dom";
import { Alert } from "antd";

import { LoginPage } from "../features/auth/login-page";
import { ExperimentDetailPage } from "../features/experiments/experiment-detail-page";
import { ExperimentEditorPage } from "../features/experiments/experiment-editor-page";
import { ExperimentListPage } from "../features/experiments/experiment-list-page";
import { ExperimentNewPage } from "../features/experiments/experiment-new-page";
import { AppShell } from "../shared/ui/app-shell";
import { ProtectedRoute } from "./routes/route-guards";

function PlaceholderPage({ message }: { message: string }) {
  return <Alert message={message} showIcon type="info" />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate replace to="/experiments" />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        path: "/experiments",
        element: <ExperimentListPage />,
      },
      {
        path: "/experiments/new",
        element: <ExperimentNewPage />,
      },
      {
        path: "/experiments/:experimentId",
        element: <ExperimentDetailPage />,
      },
      {
        path: "/experiments/:experimentId/edit",
        element: <ExperimentEditorPage />,
      },
      {
        path: "/admin/vocabularies",
        element: <PlaceholderPage message="受控词表后台会在后续阶段接入。" />,
      },
    ],
  },
]);
