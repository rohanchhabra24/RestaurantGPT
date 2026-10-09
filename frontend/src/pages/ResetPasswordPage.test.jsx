import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetPasswordPage from "./ResetPasswordPage.jsx";
import { useAuth } from "../authContext.jsx";

// This page is the fix for a real gap the production-readiness audit
// found: a password-reset email link produces a real Supabase session,
// which (without this page intercepting it, see App.jsx's Gate) would
// route straight into the dashboard without ever requiring a new
// password. The password-mismatch guard and the forced-continue flow are
// the two behaviors most worth protecting against a silent regression.

vi.mock("../authContext.jsx", () => ({
  useAuth: vi.fn(),
}));

describe("ResetPasswordPage", () => {
  let updatePassword, clearPasswordRecovery, signOut;

  beforeEach(() => {
    updatePassword = vi.fn().mockResolvedValue({ error: null });
    clearPasswordRecovery = vi.fn();
    signOut = vi.fn();
    useAuth.mockReturnValue({ updatePassword, clearPasswordRecovery, signOut });
  });

  it("rejects mismatched passwords without calling updatePassword", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByPlaceholderText(/^new password/i), "correcthorse1");
    await user.type(screen.getByPlaceholderText(/confirm new password/i), "differentpass1");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("calls updatePassword and shows the confirmation when passwords match", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByPlaceholderText(/^new password/i), "correcthorse1");
    await user.type(screen.getByPlaceholderText(/confirm new password/i), "correcthorse1");
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(updatePassword).toHaveBeenCalledWith("correcthorse1");
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("clears password-recovery mode when continuing after success", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByPlaceholderText(/^new password/i), "correcthorse1");
    await user.type(screen.getByPlaceholderText(/confirm new password/i), "correcthorse1");
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));

    expect(clearPasswordRecovery).toHaveBeenCalledTimes(1);
  });

  it("signs out and clears recovery mode on cancel", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.click(screen.getByRole("button", { name: "Cancel and sign out" }));

    expect(clearPasswordRecovery).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
