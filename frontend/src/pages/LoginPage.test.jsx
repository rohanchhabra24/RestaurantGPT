import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage.jsx";
import { useAuth } from "../authContext.jsx";

// The forgot-password flow added here (signin -> forgot -> back) is new
// and has no coverage anywhere else — this is the one place its mode
// switching and the enumeration-safe "always the same message" behavior
// (see LoginPage.jsx's submit()) can be checked without a real Supabase
// project.

vi.mock("../authContext.jsx", () => ({
  useAuth: vi.fn(),
  SESSION_EXPIRED_KEY: "rgpt_session_expired",
}));

function renderAt(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  let signIn, signUp, resetPasswordForEmail;

  beforeEach(() => {
    signIn = vi.fn().mockResolvedValue({ error: null });
    signUp = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    useAuth.mockReturnValue({ signIn, signUp, resetPasswordForEmail });
  });

  it("defaults to the sign-in form", () => {
    renderAt("/login");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it("opens on signup when ?mode=signup is in the URL", () => {
    renderAt("/login?mode=signup");
    expect(screen.getByRole("heading", { name: "Create an account" })).toBeInTheDocument();
  });

  it("switches to the forgot-password form and hides the password field", async () => {
    const user = userEvent.setup();
    renderAt("/login");

    await user.click(screen.getByText("Forgot password?"));

    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/password/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });

  it("submits the reset request and shows the enumeration-safe confirmation", async () => {
    const user = userEvent.setup();
    renderAt("/login");

    await user.click(screen.getByText("Forgot password?"));
    await user.type(screen.getByPlaceholderText("you@restaurant.com"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(resetPasswordForEmail).toHaveBeenCalledWith("owner@example.com");
    expect(await screen.findByText(/If an account exists for owner@example.com/)).toBeInTheDocument();
  });

  it("returns to sign-in from the forgot-password form", async () => {
    const user = userEvent.setup();
    renderAt("/login");

    await user.click(screen.getByText("Forgot password?"));
    await user.click(screen.getByText("Back to sign in"));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it("calls signIn with the entered credentials", async () => {
    const user = userEvent.setup();
    renderAt("/login");

    await user.type(screen.getByPlaceholderText("you@restaurant.com"), "owner@example.com");
    await user.type(screen.getByPlaceholderText(/password/i), "hunter22");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signIn).toHaveBeenCalledWith("owner@example.com", "hunter22");
  });
});
