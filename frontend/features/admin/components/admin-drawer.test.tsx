/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminDrawer } from "@/features/admin/components/admin-drawer";

describe("AdminDrawer", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("portals the complete drawer to the document body", () => {
    const host = document.createElement("div");
    document.body.append(host);

    render(
      <AdminDrawer
        footer={<button type="button">Footer action</button>}
        isOpen
        onClose={vi.fn()}
        subtitle="user@example.com"
        title="User sessions"
      >
        <p>Session history</p>
      </AdminDrawer>,
      { container: host },
    );

    const root = document.body.querySelector(".admin-drawer-root");
    expect(root).not.toBeNull();
    expect(host.querySelector(".admin-drawer-root")).toBeNull();
    expect(screen.getByRole("heading", { name: "User sessions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Footer action" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
  });
});
