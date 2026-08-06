from app.modules.stocks.stock_search import escape_ilike_pattern


def test_escape_ilike_pattern_escapes_wildcards() -> None:
    assert escape_ilike_pattern("mt") == "mt"
    assert escape_ilike_pattern("100%") == "100\\%"
    assert escape_ilike_pattern("a_b") == "a\\_b"
    assert escape_ilike_pattern("a\\b") == "a\\\\b"
