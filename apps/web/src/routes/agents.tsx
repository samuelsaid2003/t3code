import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { isElectron } from "~/env";

export const Route = createFileRoute("/agents")({
  beforeLoad: () => {
    if (!isElectron) {
      throw redirect({ to: "/" });
    }
  },
  component: Outlet,
});
