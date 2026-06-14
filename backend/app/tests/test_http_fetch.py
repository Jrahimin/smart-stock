"""Tests for shared HTTP fetch SSL context."""

import ssl

from app.jobs.ingestion import http_fetch


def test_build_ssl_context_uses_certifi_when_available() -> None:
    context = http_fetch.build_ssl_context()
    assert isinstance(context, ssl.SSLContext)
    if http_fetch.certifi is not None:
        assert context.verify_mode == ssl.CERT_REQUIRED


def test_build_ssl_context_can_disable_verification() -> None:
    context = http_fetch.build_ssl_context(verify=False)
    assert context.verify_mode == ssl.CERT_NONE
    assert context.check_hostname is False
