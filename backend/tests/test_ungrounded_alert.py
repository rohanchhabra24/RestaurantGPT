from app.routers.insights import ungrounded_rate_over_threshold


def test_below_min_samples_never_alerts_even_at_100_pct():
    # 1 of 1 ungrounded is 100% but tells you nothing at that sample size
    rate, over = ungrounded_rate_over_threshold(total=1, ungrounded=1)
    assert over is False
    assert rate == 0.0


def test_at_min_samples_with_zero_ungrounded_does_not_alert():
    # 5 samples (exactly at the min), 0 ungrounded = 0%
    rate, over = ungrounded_rate_over_threshold(total=5, ungrounded=0)
    assert rate == 0.0
    assert over is False


def test_at_min_samples_with_rate_exactly_at_threshold_alerts():
    # 5 samples (exactly at the min), 1 ungrounded = 20% = exactly at threshold
    rate, over = ungrounded_rate_over_threshold(total=5, ungrounded=1)
    assert rate == 20.0
    assert over is True


def test_rate_at_threshold_alerts():
    rate, over = ungrounded_rate_over_threshold(total=10, ungrounded=2)  # 20%
    assert rate == 20.0
    assert over is True


def test_rate_above_threshold_alerts():
    rate, over = ungrounded_rate_over_threshold(total=10, ungrounded=5)  # 50%
    assert rate == 50.0
    assert over is True


def test_rate_below_threshold_does_not_alert():
    rate, over = ungrounded_rate_over_threshold(total=20, ungrounded=1)  # 5%
    assert rate == 5.0
    assert over is False


def test_zero_total_does_not_alert():
    rate, over = ungrounded_rate_over_threshold(total=0, ungrounded=0)
    assert rate == 0.0
    assert over is False
