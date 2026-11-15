"""Conservative issuer/exchange disclosure recognition, not topic detection."""
from __future__ import annotations
import re
from app.core.enums import MarketEventType


def classify_market_event_notice(*, title: str, content: str) -> tuple[MarketEventType, bool]:
    """Return the recognized notice kind and materiality from the same action."""
    heading = " ".join(title.casefold().split())
    body = " ".join(content.casefold().split())
    combined = heading + " " + body
    # Authority belongs to an asserted clause, not an issuer phrase quoted
    # inside a rumor, denial or somebody else's account of an action.
    clauses = re.split(r"(?<=[.!?;])\s+(?=[a-z])", body)
    issuer_prefix = r"(?:the company|the board(?: of directors)?)"
    issuer_report = r"(?:the company (?:(?:has|have|hereby) )?(?:informed|announced|notified) (?:that )?)?"
    commentary = re.search(r"\b(analysts?|commentary|rumou?rs?|speculation|hypothetical)\b|\b(could|might|would)\b|\bmay (?:be|suspend|remain)\b|\bplans? to\b", combined)
    official = any(re.match(r"(?:the company|the board(?: of directors)?|the exchange|dse|cse) (?:(?:has|have|hereby) )?(?:informed|announced|notified|declared|recommended|approved|appointed)\b", clause) for clause in clauses)
    # Ambiguous forecasts/advice are news, even when they discuss a suspension
    # or recommend stocks with dividend yields. Never infer official status.
    if commentary and not official:
        return MarketEventType.NEWS, False
    standard_notice = bool(re.match(r"^(?:spot news|trading suspension|suspension notice|suspension of trading|record date)(?:\b|$)", heading))
    share_action = re.search(r"trading of (?:the )?(?:shares|securities).{0,150}?(?:will|shall|is|are|has been) (?:be |remain )?(?:suspended|allowed|settled)", body)
    if share_action and (official or standard_notice):
        return MarketEventType.REGULATORY, True
    if heading in {"price sensitive information", "material information", "price limit open"} and (official or "trading of the shares" in body):
        return MarketEventType.REGULATORY, True
    dividend_notice = heading in {"dividend declaration", "dividend disbursement", "dividend payment", "recommendation of dividend"}
    dividend_verb = r"(?:declared|recommended|approved|disbursed|paid)"
    payout_term = r"(?:a|an|the|cash|stock|interim|final|special|total|annual|and|percent|per|cent|bdt|tk|taka|of|payment|disbursement|share|[0-9]+(?:[.,][0-9]+)*%?)"
    # The payout itself must be the action's object. Arbitrary prose can join
    # an unrelated approval to another actor's proposal, even in one sentence.
    qualifier_term = r"(?:tk\.?|bdt|taka|[0-9]+(?:[.,][0-9]+)*%?|per|share|each|cash|stock|interim|final|annual|including|and|of|the|for|year|subject|to|approval|agm)"
    financial_parenthetical = r"\s*\(\s*(?:" + qualifier_term + r"\s+)*" + qualifier_term + r"\s*\)"
    payout_end = r"(?=$|\s*[.,;:!?]|" + financial_parenthetical + r"|\s+(?:for|of|to|at|on|in|as|by|with|during|after|before|from|subject|payable|per|amounting|which|and|today|yesterday|tomorrow|recently|earlier|now)\b|\s+(?:this|last|next)\s+(?:morning|afternoon|evening|night|week|month|year)\b)"
    dividend_object = r"\s+(?:" + payout_term + r"\s+)*dividend\b" + payout_end
    issuer_dividend_action = any(re.match(issuer_report + issuer_prefix + r" (?:(?:has|have|hereby) )?" + dividend_verb + dividend_object, clause) for clause in clauses)
    # A source's terse notice may omit its issuer, but cannot contain another
    # actor/proposal between the action and the actual payout description.
    terse_dividend_action = re.match(dividend_verb + dividend_object, body)
    denied_dividend_action = re.search(r"\b(?:not|never)\b.{0,24}\b(?:declared|recommended|approved|disbursed|paid)\b|\bno (?:payout|dividend) (?:decision|recommendation)\b", body)
    declared_dividend_heading = re.fullmatch(r"(?:cash|stock) dividend(?: (?:declaration|payment|disbursement))?", heading)
    if not denied_dividend_action and (issuer_dividend_action or terse_dividend_action and (dividend_notice or declared_dividend_heading)):
        return MarketEventType.DISCLOSURE, True
    statutory_board_schedule = re.fullmatch(r"board meeting schedule under lr\s*16\s*\(\s*1\s*\)", heading) and "meeting of the board of directors" in body
    if (heading == "board meeting" or "board meeting will be held" in body or statutory_board_schedule) and (official or not commentary):
        return MarketEventType.BOARD_MEETING, False
    if heading.startswith("appointment of ") and official:
        return MarketEventType.DISCLOSURE, False
    if heading in {"agm", "egm", "annual general meeting", "extraordinary general meeting"}:
        return MarketEventType.OTHER, False
    return MarketEventType.NEWS, False


def classify_market_event_type(*, title: str, content: str) -> MarketEventType:
    return classify_market_event_notice(title=title, content=content)[0]
