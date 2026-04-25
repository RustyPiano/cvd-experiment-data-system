import { RouterProvider } from "react-router-dom";

import { AppProviders } from "./providers";
import { router } from "./router";
import { AppErrorBoundary } from "../shared/ui/app-error-boundary";

export default function App() {
  return (
    <AppProviders>
      <AppErrorBoundary>
        <RouterProvider router={router} />
      </AppErrorBoundary>
    </AppProviders>
  );
}
