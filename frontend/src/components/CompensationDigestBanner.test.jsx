import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CompensationDigestBanner from "./CompensationDigestBanner.jsx";

// Covers the visibility logic directly — this banner is the app's
// highest-value proactive finding (see Topbar.jsx's persistent badge,
// built specifically because an earlier version of this banner could
// vanish for the rest of the day on an accidental dismiss-click), so
// getting its show/hide rules wrong is a real regression risk.

const BASE_DIGEST = { id: "d1", status: "new", new_claims_count: 4, new_recoverable_amount: 1240 };

describe("CompensationDigestBanner", () => {
  it("renders nothing when there is no digest", () => {
    const { container } = render(<CompensationDigestBanner digest={null} onReview={() => {}} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are zero new claims", () => {
    const digest = { ...BASE_DIGEST, new_claims_count: 0 };
    const { container } = render(<CompensationDigestBanner digest={digest} onReview={() => {}} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing once dismissed, unless forceShow overrides it", () => {
    const digest = { ...BASE_DIGEST, status: "dismissed" };
    const { container, rerender } = render(<CompensationDigestBanner digest={digest} onReview={() => {}} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<CompensationDigestBanner digest={digest} forceShow onReview={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText("New compensation found")).toBeInTheDocument();
  });

  it("shows the claim count and amount when there's a new digest", () => {
    render(<CompensationDigestBanner digest={BASE_DIGEST} onReview={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText(/4 new claims drafted overnight/)).toBeInTheDocument();
    expect(screen.getByText(/₹1240 in total/)).toBeInTheDocument();
  });

  it("uses singular 'claim' for exactly one", () => {
    const digest = { ...BASE_DIGEST, new_claims_count: 1 };
    render(<CompensationDigestBanner digest={digest} onReview={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText(/1 new claim drafted overnight/)).toBeInTheDocument();
  });

  it("calls onReview and onDismiss from their respective buttons", async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    const onDismiss = vi.fn();
    render(<CompensationDigestBanner digest={BASE_DIGEST} onReview={onReview} onDismiss={onDismiss} />);

    await user.click(screen.getByRole("button", { name: "Review claims" }));
    expect(onReview).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
