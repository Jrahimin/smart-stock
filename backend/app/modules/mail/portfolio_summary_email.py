from __future__ import annotations

from decimal import Decimal
from html import escape

from app.modules.mail.portfolio_summary_email_language import (
    attention_label,
    get_portfolio_summary_email_language,
    severity_label,
)
from app.modules.portfolios.portfolios_schemas import PortfolioWorkspaceRead


def _money(value: Decimal | None) -> str:
    if value is None:
        return "—"
    formatted = f"{abs(value):,.2f}"
    return f"-৳{formatted}" if value < 0 else f"৳{formatted}"


def _percent(value: Decimal | None) -> str:
    if value is None:
        return "—"
    sign = "+" if value > 0 else ""
    return f"{sign}{value:.2f}%"


def build_portfolio_summary_email(
    *,
    display_name: str,
    workspace: PortfolioWorkspaceRead,
    portfolio_url: str,
    locale: str | None = None,
) -> tuple[str, str, str]:
    trade_date = workspace.meta.published_market_date
    date_label = trade_date.isoformat() if trade_date else "today"
    copy = get_portfolio_summary_email_language(locale)
    subject = copy["subject"].format(date=date_label)

    attention_lines = []
    for item in workspace.attention[:3]:
        title = attention_label(locale, item.code)
        symbols = ", ".join(item.symbols[:4])
        if item.count > 4:
            symbols = f"{symbols} +{item.count - 4}"
        attention_lines.append(
            f"- {title}: {symbols} ({severity_label(locale, item.severity)})"
        )

    if not attention_lines:
        attention_lines.append(f"- {copy['no_attention']}")

    pulse = workspace.pulse
    plain_lines = [
        copy["greeting"].format(name=display_name),
        "",
        copy["intro"].format(date=date_label),
        "",
        f"{copy['known_current_value']}: {_money(pulse.known_current_value)}",
        (
            f"{copy['known_unrealized_pl']}: "
            f"{_money(pulse.known_unrealized_gain_amount)} "
            f"({_percent(pulse.known_unrealized_gain_percent)})"
        ),
        (
            f"{copy['estimated_daily_movement']}: "
            f"{_money(pulse.estimated_daily_change_amount)} "
            f"({_percent(pulse.estimated_daily_change_percent)})"
        ),
        f"{copy['holdings']}: {pulse.holding_count}",
        "",
        f"{copy['needs_attention']}:",
        *attention_lines,
        "",
        f"{copy['open_portfolio']}: {portfolio_url}",
        "",
        copy["footer"],
    ]
    body = "\n".join(plain_lines)

    attention_html = "".join(
        f"<li><strong>{escape(attention_label(locale, item.code))}</strong>"
        f" · {escape(', '.join(item.symbols[:4]))}"
        f"{' +' + str(item.count - 4) if item.count > 4 else ''}"
        f" <span style='color:#a16207;font-size:12px;'>"
        f"{escape(severity_label(locale, item.severity))}</span></li>"
        for item in workspace.attention[:3]
    ) or f"<li>{escape(copy['no_attention'])}</li>"

    body_html = f"""<!DOCTYPE html>
<html lang="{escape(copy['html_lang'])}">
  <body style="margin:0;padding:0;background:#f4f1ec;font-family:Segoe UI,Arial,sans-serif;color:#161b25;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ec;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf9;border:1px solid #d8cec0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:linear-gradient(135deg,#4f46e5,#6d28d9);color:#ffffff;">
                <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">{escape(copy['portfolio_summary_eyebrow'])}</div>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">{escape(copy['day_end_snapshot'].format(name=display_name))}</h1>
                <p style="margin:10px 0 0;font-size:14px;opacity:.92;">{escape(copy['session_date'].format(date=date_label))}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
                  <tr>
                    <td style="padding:14px 16px;background:#f4eee5;border:1px solid #d8cec0;border-radius:12px;">
                      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#526075;">{escape(copy['known_current_value'])}</div>
                      <div style="font-size:28px;font-weight:700;margin-top:6px;">{_money(pulse.known_current_value)}</div>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
                  <tr>
                    <td width="50%" style="padding-right:8px;">
                      <div style="padding:12px 14px;background:#faf7f2;border:1px solid #e7ddd0;border-radius:12px;">
                        <div style="font-size:11px;color:#526075;text-transform:uppercase;">{escape(copy['known_unrealized_pl'])}</div>
                        <div style="font-size:18px;font-weight:700;margin-top:4px;">{_money(pulse.known_unrealized_gain_amount)}</div>
                        <div style="font-size:12px;color:#526075;margin-top:2px;">{_percent(pulse.known_unrealized_gain_percent)}</div>
                      </div>
                    </td>
                    <td width="50%" style="padding-left:8px;">
                      <div style="padding:12px 14px;background:#faf7f2;border:1px solid #e7ddd0;border-radius:12px;">
                        <div style="font-size:11px;color:#526075;text-transform:uppercase;">{escape(copy['estimated_daily_movement'])}</div>
                        <div style="font-size:18px;font-weight:700;margin-top:4px;">{_money(pulse.estimated_daily_change_amount)}</div>
                        <div style="font-size:12px;color:#526075;margin-top:2px;">{_percent(pulse.estimated_daily_change_percent)}</div>
                      </div>
                    </td>
                  </tr>
                </table>
                <h2 style="margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#526075;">{escape(copy['needs_attention'])}</h2>
                <ul style="margin:0 0 22px;padding-left:18px;line-height:1.55;font-size:14px;">{attention_html}</ul>
                <a href="{escape(portfolio_url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">{escape(copy['open_portfolio'])}</a>
                <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#526075;">{escape(copy['footer'])}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""

    return subject, body, body_html
