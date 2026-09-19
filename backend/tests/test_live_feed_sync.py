"""validate_feed_url is the guardrail between a tenant-supplied
live_feed_url and this server making a real server-side HTTP request to
it once a day, unattended — these are the SSRF patterns considered during
the audit that added this check, encoded as regression tests. Uses literal
IP addresses (not hostnames) throughout so these tests never depend on
real DNS/network access — socket.getaddrinfo resolves a literal IP purely
locally.
"""

import pytest

from app.services.live_feed_sync import UnsafeFeedURLError, validate_feed_url


def test_public_https_url_passes():
    validate_feed_url("https://8.8.8.8/feed")  # should not raise


def test_plain_http_rejected():
    with pytest.raises(UnsafeFeedURLError):
        validate_feed_url("http://8.8.8.8/feed")


def test_cloud_metadata_ip_rejected():
    with pytest.raises(UnsafeFeedURLError):
        validate_feed_url("https://169.254.169.254/latest/meta-data/")


def test_loopback_rejected():
    with pytest.raises(UnsafeFeedURLError):
        validate_feed_url("https://127.0.0.1/feed")


def test_private_rfc1918_rejected():
    with pytest.raises(UnsafeFeedURLError):
        validate_feed_url("https://10.0.0.5/feed")
    with pytest.raises(UnsafeFeedURLError):
        validate_feed_url("https://192.168.1.1/feed")


def test_missing_host_rejected():
    with pytest.raises(UnsafeFeedURLError):
        validate_feed_url("https:///feed")


def test_other_scheme_rejected():
    with pytest.raises(UnsafeFeedURLError):
        validate_feed_url("file:///etc/passwd")
