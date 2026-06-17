#!/usr/bin/env python3
"""Slack Web API CLI.

Subcommand mode is intended for programmatic use (Claude calls it).
`menu` mode is interactive for manual testing.

Credentials are loaded from, in order:
  1. env vars SLACK_TOKEN (and SLACK_COOKIE for xoxc browser tokens) — bypasses profiles
  2. ~/.config/slack-skill/credentials.json — multi-profile store written by `auth`

Profile selection (when not using env vars):
  --profile NAME  >  $SLACK_PROFILE  >  the "default" key in the credentials file
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests

CONFIG_DIR = Path.home() / ".config" / "slack-skill"
CONFIG_FILE = CONFIG_DIR / "credentials.json"
API = "https://slack.com/api"

# Set in main() from --profile / $SLACK_PROFILE; None means "use default key".
_PROFILE: str | None = None

# -- credentials ------------------------------------------------------------

def _read_store() -> dict[str, Any]:
    """Read the credentials file, migrating the legacy single-profile shape."""
    if not CONFIG_FILE.exists():
        return {"default": None, "profiles": {}}
    data = json.loads(CONFIG_FILE.read_text())
    # Legacy: {"token": "...", "cookie": "..."} → wrap as profile "default"
    if "profiles" not in data and "token" in data:
        legacy: dict[str, Any] = {"token": data["token"]}
        if data.get("cookie"):
            legacy["cookie"] = data["cookie"]
        data = {"default": "default", "profiles": {"default": legacy}}
        _write_store(data)
    data.setdefault("default", None)
    data.setdefault("profiles", {})
    return data


def _write_store(data: dict[str, Any]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(data, indent=2))
    CONFIG_FILE.chmod(0o600)


def load_credentials() -> tuple[str, str | None]:
    token = os.environ.get("SLACK_TOKEN")
    if token:
        return token, os.environ.get("SLACK_COOKIE")

    store = _read_store()
    name = _PROFILE or os.environ.get("SLACK_PROFILE") or store.get("default")
    if not name:
        sys.exit("No credentials. Run: slack.py auth  (or set SLACK_TOKEN)")
    prof = store["profiles"].get(name)
    if not prof:
        available = ", ".join(sorted(store["profiles"])) or "(none)"
        sys.exit(f"Profile '{name}' not found. Available: {available}")
    return prof["token"], prof.get("cookie")


def save_profile(name: str, token: str, cookie: str | None, team: str | None = None, team_id: str | None = None, make_default: bool = False) -> None:
    store = _read_store()
    payload: dict[str, Any] = {"token": token}
    if cookie:
        payload["cookie"] = cookie
    if team:
        payload["team"] = team
    if team_id:
        payload["team_id"] = team_id
    store["profiles"][name] = payload
    if make_default or not store.get("default"):
        store["default"] = name
    _write_store(store)


# -- transport --------------------------------------------------------------

def api_call(method: str, params: dict[str, Any] | None = None, post: bool = False) -> dict[str, Any]:
    token, cookie = load_credentials()
    headers: dict[str, str] = {"Authorization": f"Bearer {token}"}
    cookies = {"d": cookie} if cookie else None
    url = f"{API}/{method}"
    while True:
        if post:
            headers["Content-Type"] = "application/json; charset=utf-8"
            r = requests.post(url, headers=headers, cookies=cookies, json=params or {}, timeout=30)
        else:
            r = requests.get(url, headers=headers, cookies=cookies, params=params or {}, timeout=30)
        if r.status_code == 429:
            wait = int(r.headers.get("Retry-After", "1"))
            print(f"rate-limited, sleeping {wait}s", file=sys.stderr)
            time.sleep(wait + 1)
            continue
        r.raise_for_status()
        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(f"Slack API error: {data.get('error')} ({method})")
        return data


def paginate(method: str, params: dict[str, Any], key: str, page_cb=None) -> list[dict]:
    items: list[dict] = []
    cursor: str | None = None
    while True:
        p = dict(params)
        if cursor:
            p["cursor"] = cursor
        data = api_call(method, p)
        batch = data.get(key, [])
        items.extend(batch)
        if page_cb:
            page_cb(len(items))
        cursor = data.get("response_metadata", {}).get("next_cursor") or None
        if not cursor:
            break
    return items


# -- resolution -------------------------------------------------------------

_ID_RE = re.compile(r"^[CDGU][A-Z0-9]{6,}$")


def resolve_channel(name_or_id: str) -> str:
    if not name_or_id:
        raise SystemExit("empty channel")
    s = name_or_id.strip()
    if _ID_RE.match(s):
        # treat user IDs as a DM target
        if s.startswith("U"):
            return api_call("conversations.open", {"users": s}, post=True)["channel"]["id"]
        return s
    if s.startswith("@"):
        uname = s[1:]
        for u in paginate("users.list", {"limit": 1000}, "members"):
            if u.get("name") == uname or u.get("profile", {}).get("display_name") == uname:
                return api_call("conversations.open", {"users": u["id"]}, post=True)["channel"]["id"]
        raise SystemExit(f"user not found: {s}")
    cname = s.lstrip("#")
    for c in paginate("conversations.list", {"types": "public_channel,private_channel,mpim", "limit": 1000}, "channels"):
        if c.get("name") == cname:
            return c["id"]
    raise SystemExit(f"channel not found: {s}")


# -- commands ---------------------------------------------------------------

def cmd_auth(args):
    global _PROFILE
    print("Token types:", file=sys.stderr)
    print("  xoxc-...  browser session (also needs the 'd' cookie value)", file=sys.stderr)
    print("  xoxp-...  user token", file=sys.stderr)
    print("  xoxb-...  bot token", file=sys.stderr)
    token = getpass.getpass("Token: ").strip()
    cookie: str | None = None
    if token.startswith("xoxc"):
        cookie = getpass.getpass("d cookie value (just the value, no 'd=' prefix): ").strip() or None

    # Verify before saving — first stash in a temp profile so api_call() can find it.
    store = _read_store()
    tmp_name = "__auth_probe__"
    store["profiles"][tmp_name] = {"token": token, **({"cookie": cookie} if cookie else {})}
    _write_store(store)
    prev_profile = _PROFILE
    _PROFILE = tmp_name
    try:
        data = api_call("auth.test")
    finally:
        _PROFILE = prev_profile
        store = _read_store()
        store["profiles"].pop(tmp_name, None)
        _write_store(store)

    team = data.get("team") or "workspace"
    suggested = getattr(args, "name", None) or _slugify(team)
    name = input(f"Save as profile name [{suggested}]: ").strip() or suggested
    existing = name in _read_store()["profiles"]
    make_default = getattr(args, "make_default", False)
    if not make_default:
        cur_default = _read_store().get("default")
        if not cur_default or cur_default == name:
            make_default = True
        else:
            ans = input(f"Set '{name}' as default profile? (current: {cur_default}) (y/N): ").strip().lower()
            make_default = ans.startswith("y")

    save_profile(name, token, cookie, team=team, team_id=data.get("team_id"), make_default=make_default)
    print(json.dumps({
        "ok": True,
        "profile": name,
        "default": make_default,
        "overwrote": existing,
        "user": data.get("user"),
        "team": team,
        "user_id": data.get("user_id"),
        "team_id": data.get("team_id"),
    }, indent=2))


def _slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "default"


def cmd_list_profiles(args):
    store = _read_store()
    out = {
        "default": store.get("default"),
        "profiles": [
            {
                "name": name,
                "team": p.get("team"),
                "team_id": p.get("team_id"),
                "token_prefix": (p.get("token", "")[:5] + "…") if p.get("token") else None,
                "has_cookie": bool(p.get("cookie")),
            }
            for name, p in sorted(store["profiles"].items())
        ],
    }
    print(json.dumps(out, indent=2))


def cmd_use_profile(args):
    store = _read_store()
    if args.name not in store["profiles"]:
        sys.exit(f"Profile '{args.name}' not found.")
    store["default"] = args.name
    _write_store(store)
    print(json.dumps({"ok": True, "default": args.name}, indent=2))


def cmd_remove_profile(args):
    store = _read_store()
    if args.name not in store["profiles"]:
        sys.exit(f"Profile '{args.name}' not found.")
    del store["profiles"][args.name]
    if store.get("default") == args.name:
        remaining = sorted(store["profiles"])
        store["default"] = remaining[0] if remaining else None
    _write_store(store)
    print(json.dumps({"ok": True, "removed": args.name, "default": store.get("default")}, indent=2))


def cmd_whoami(args):
    print(json.dumps(api_call("auth.test"), indent=2))


TYPE_MAP = {
    "all": "public_channel,private_channel,mpim,im",
    "public": "public_channel",
    "private": "private_channel",
    "im": "im",
    "mpim": "mpim",
}


def cmd_list_channels(args):
    chans = paginate(
        "conversations.list",
        {"types": TYPE_MAP[args.type], "limit": 1000, "exclude_archived": "true"},
        "channels",
    )
    users: dict[str, dict] = {}
    if any(c.get("is_im") for c in chans):
        users = {u["id"]: u for u in paginate("users.list", {"limit": 1000}, "members")}
    out = []
    for c in chans:
        if c.get("is_im"):
            u = users.get(c.get("user", ""), {})
            name = f"@{u.get('name') or c.get('user')}"
        elif c.get("is_mpim"):
            name = c.get("name", "(mpim)")
        else:
            name = f"#{c.get('name', '')}"
        if args.search and args.search.lower() not in name.lower():
            continue
        out.append({
            "id": c["id"],
            "name": name,
            "is_im": c.get("is_im", False),
            "is_mpim": c.get("is_mpim", False),
            "is_private": c.get("is_private", False),
            "is_archived": c.get("is_archived", False),
        })
    print(json.dumps(out, indent=2))


def cmd_list_users(args):
    users = paginate("users.list", {"limit": 1000}, "members")
    out = []
    for u in users:
        if u.get("deleted"):
            continue
        rec = {
            "id": u["id"],
            "name": u.get("name"),
            "real_name": u.get("real_name"),
            "display_name": u.get("profile", {}).get("display_name"),
            "is_bot": u.get("is_bot", False),
        }
        if args.search:
            hay = " ".join(str(v or "") for v in rec.values()).lower()
            if args.search.lower() not in hay:
                continue
        out.append(rec)
    print(json.dumps(out, indent=2))


def _history(cid: str, limit: int | None, oldest: str | None, latest: str | None) -> list[dict]:
    msgs: list[dict] = []
    cursor: str | None = None
    params: dict[str, Any] = {"channel": cid, "limit": 200}
    if oldest:
        params["oldest"] = oldest
    if latest:
        params["latest"] = latest
    while True:
        p = dict(params)
        if cursor:
            p["cursor"] = cursor
        data = api_call("conversations.history", p)
        msgs.extend(data.get("messages", []))
        if limit and len(msgs) >= limit:
            return msgs[:limit]
        if not data.get("has_more"):
            break
        cursor = data.get("response_metadata", {}).get("next_cursor") or None
        if not cursor:
            break
    return msgs


def _attach_threads(cid: str, msgs: list[dict], log: bool = False) -> None:
    total = sum(1 for m in msgs if m.get("thread_ts") and m.get("reply_count", 0) > 0)
    done = 0
    for m in msgs:
        if m.get("thread_ts") and m.get("reply_count", 0) > 0:
            replies = paginate("conversations.replies", {"channel": cid, "ts": m["thread_ts"], "limit": 200}, "messages")
            m["_thread"] = replies
            done += 1
            if log and done % 25 == 0:
                print(f"  threads: {done}/{total}", file=sys.stderr)


def cmd_history(args):
    cid = resolve_channel(args.channel)
    msgs = _history(cid, args.limit, args.oldest, args.latest)
    if args.with_threads:
        _attach_threads(cid, msgs)
    print(json.dumps(msgs, indent=2))


def cmd_thread(args):
    cid = resolve_channel(args.channel)
    replies = paginate("conversations.replies", {"channel": cid, "ts": args.ts, "limit": 200}, "messages")
    print(json.dumps(replies, indent=2))


def cmd_send(args):
    cid = resolve_channel(args.channel)
    params: dict[str, Any] = {"channel": cid, "text": args.text}
    if args.thread:
        params["thread_ts"] = args.thread
    data = api_call("chat.postMessage", params, post=True)
    print(json.dumps({"ok": True, "channel": data["channel"], "ts": data["ts"]}, indent=2))


def cmd_react(args):
    cid = resolve_channel(args.channel)
    api_call("reactions.add", {"channel": cid, "timestamp": args.ts, "name": args.emoji.strip(":")}, post=True)
    print(json.dumps({"ok": True}))


def cmd_search(args):
    data = api_call("search.messages", {"query": args.query, "count": args.limit, "sort": args.sort})
    print(json.dumps(data.get("messages", {}), indent=2))


def cmd_info(args):
    cid = resolve_channel(args.channel)
    data = api_call("conversations.info", {"channel": cid})
    print(json.dumps(data.get("channel"), indent=2))


def cmd_export(args):
    cid = resolve_channel(args.channel)
    info = api_call("conversations.info", {"channel": cid}).get("channel", {})
    label = info.get("name") or info.get("user") or cid
    out_dir = Path(args.output) if args.output else Path.cwd() / f"slack_export_{label}_{int(time.time())}"
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Exporting {cid} ({label}) → {out_dir}", file=sys.stderr)

    msgs: list[dict] = []
    cursor: str | None = None
    while True:
        p: dict[str, Any] = {"channel": cid, "limit": 200}
        if cursor:
            p["cursor"] = cursor
        data = api_call("conversations.history", p)
        msgs.extend(data.get("messages", []))
        print(f"  fetched {len(msgs)} messages", file=sys.stderr)
        if not data.get("has_more"):
            break
        cursor = data.get("response_metadata", {}).get("next_cursor") or None
        if not cursor:
            break

    if args.with_threads:
        _attach_threads(cid, msgs, log=True)

    (out_dir / "channel.json").write_text(json.dumps(info, indent=2))
    (out_dir / "messages.json").write_text(json.dumps(msgs, indent=2))
    print(json.dumps({"ok": True, "messages": len(msgs), "output": str(out_dir)}, indent=2))


# -- interactive menu -------------------------------------------------------

def _prompt(label: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    val = input(f"{label}{suffix}: ").strip()
    return val or (default or "")


def cmd_menu(args):
    if not (CONFIG_FILE.exists() or os.environ.get("SLACK_TOKEN")):
        print("No credentials found. Running setup...")
        cmd_auth(args)

    actions = [
        ("whoami", "Show identity"),
        ("channels", "List channels / DMs"),
        ("users", "List users"),
        ("history", "Read message history"),
        ("send", "Send a message"),
        ("react", "Add a reaction"),
        ("search", "Search messages"),
        ("info", "Channel info"),
        ("export", "Export full channel to JSON"),
        ("quit", "Exit"),
    ]
    while True:
        store = _read_store()
        active = _PROFILE or os.environ.get("SLACK_PROFILE") or store.get("default") or "(env)"
        print(f"\n== Slack (profile: {active}) ==")
        for i, (_, desc) in enumerate(actions, 1):
            print(f"  {i}) {desc}")
        raw = input("> ").strip()
        if not raw:
            continue
        try:
            idx = int(raw) - 1
            key = actions[idx][0]
        except (ValueError, IndexError):
            print("invalid choice")
            continue

        try:
            if key == "quit":
                return
            elif key == "whoami":
                cmd_whoami(args)
            elif key == "channels":
                t = _prompt("type [all/public/private/im/mpim]", "all")
                q = _prompt("search filter (blank for none)") or None
                cmd_list_channels(argparse.Namespace(type=t, search=q))
            elif key == "users":
                q = _prompt("search filter (blank for none)") or None
                cmd_list_users(argparse.Namespace(search=q))
            elif key == "history":
                c = _prompt("channel (#name / @user / ID)")
                n = int(_prompt("limit", "50"))
                wt = _prompt("with threads? (y/N)", "n").lower().startswith("y")
                cmd_history(argparse.Namespace(channel=c, limit=n, oldest=None, latest=None, with_threads=wt))
            elif key == "send":
                c = _prompt("channel")
                text = input("message: ")
                th = _prompt("thread ts (blank for none)") or None
                confirm = _prompt(f"send to {c}? (y/N)", "n").lower().startswith("y")
                if not confirm:
                    print("cancelled")
                    continue
                cmd_send(argparse.Namespace(channel=c, text=text, thread=th))
            elif key == "react":
                c = _prompt("channel")
                ts = _prompt("message ts")
                emoji = _prompt("emoji name (e.g. thumbsup)")
                cmd_react(argparse.Namespace(channel=c, ts=ts, emoji=emoji))
            elif key == "search":
                q = _prompt("query")
                n = int(_prompt("limit", "20"))
                cmd_search(argparse.Namespace(query=q, limit=n, sort="timestamp"))
            elif key == "info":
                c = _prompt("channel")
                cmd_info(argparse.Namespace(channel=c))
            elif key == "export":
                c = _prompt("channel")
                o = _prompt("output dir (blank for auto)") or None
                wt = _prompt("with threads? (Y/n)", "y").lower().startswith("y")
                cmd_export(argparse.Namespace(channel=c, output=o, with_threads=wt))
        except KeyboardInterrupt:
            print("\ninterrupted")
        except Exception as e:
            print(f"error: {e}", file=sys.stderr)


# -- argparse ---------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Slack Web API CLI")
    p.add_argument("--profile", help="credentials profile name (overrides $SLACK_PROFILE and the stored default)")
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("auth", help="store credentials under a profile and verify")
    a.add_argument("--name", help="profile name (default: derived from team)")
    a.add_argument("--make-default", action="store_true", help="set as the default profile")
    a.set_defaults(func=cmd_auth)

    sub.add_parser("whoami", help="auth.test").set_defaults(func=cmd_whoami)
    sub.add_parser("menu", help="interactive mode for manual testing").set_defaults(func=cmd_menu)
    sub.add_parser("list-profiles", help="list saved credential profiles").set_defaults(func=cmd_list_profiles)

    up = sub.add_parser("use-profile", help="set the default profile")
    up.add_argument("name")
    up.set_defaults(func=cmd_use_profile)

    rp = sub.add_parser("remove-profile", help="delete a profile")
    rp.add_argument("name")
    rp.set_defaults(func=cmd_remove_profile)

    lc = sub.add_parser("list-channels", help="list channels / DMs")
    lc.add_argument("--type", choices=list(TYPE_MAP), default="all")
    lc.add_argument("--search")
    lc.set_defaults(func=cmd_list_channels)

    lu = sub.add_parser("list-users", help="list workspace users")
    lu.add_argument("--search")
    lu.set_defaults(func=cmd_list_users)

    h = sub.add_parser("history", help="read message history")
    h.add_argument("channel", help="#name, @user, or ID")
    h.add_argument("--limit", type=int, default=50)
    h.add_argument("--oldest", help="unix ts lower bound")
    h.add_argument("--latest", help="unix ts upper bound")
    h.add_argument("--with-threads", action="store_true")
    h.set_defaults(func=cmd_history)

    t = sub.add_parser("thread", help="read replies in a thread")
    t.add_argument("channel")
    t.add_argument("ts", help="parent message timestamp")
    t.set_defaults(func=cmd_thread)

    s = sub.add_parser("send", help="post a message")
    s.add_argument("channel")
    s.add_argument("text")
    s.add_argument("--thread", help="reply in this thread_ts")
    s.set_defaults(func=cmd_send)

    rx = sub.add_parser("react", help="add a reaction")
    rx.add_argument("channel")
    rx.add_argument("ts")
    rx.add_argument("emoji")
    rx.set_defaults(func=cmd_react)

    sr = sub.add_parser("search", help="search messages (user token required)")
    sr.add_argument("query")
    sr.add_argument("--limit", type=int, default=50)
    sr.add_argument("--sort", choices=["timestamp", "score"], default="timestamp")
    sr.set_defaults(func=cmd_search)

    i = sub.add_parser("info", help="conversations.info")
    i.add_argument("channel")
    i.set_defaults(func=cmd_info)

    e = sub.add_parser("export", help="export full channel history to JSON files")
    e.add_argument("channel")
    e.add_argument("--output", help="output directory (default: ./slack_export_<name>_<ts>)")
    e.add_argument("--with-threads", action="store_true")
    e.set_defaults(func=cmd_export)

    return p


def main():
    global _PROFILE
    args = build_parser().parse_args()
    _PROFILE = args.profile
    args.func(args)


if __name__ == "__main__":
    main()
