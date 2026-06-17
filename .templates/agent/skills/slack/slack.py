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
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Iterable, TypeVar

import requests

_session = requests.Session()
T = TypeVar("T")
R = TypeVar("R")


def parallel_map(fn: Callable[[T], R], items: Iterable[T], workers: int = 8) -> list[R]:
    items = list(items)
    if not items:
        return []
    if workers <= 1 or len(items) == 1:
        return [fn(x) for x in items]
    with ThreadPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(fn, items))

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
            r = _session.post(url, headers=headers, cookies=cookies, json=params or {}, timeout=30)
        else:
            r = _session.get(url, headers=headers, cookies=cookies, params=params or {}, timeout=30)
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


# -- helpers ----------------------------------------------------------------

_USER_ID: str | None = None


def my_user_id() -> str:
    global _USER_ID
    if _USER_ID is None:
        _USER_ID = api_call("auth.test")["user_id"]
    return _USER_ID


def user_map() -> dict[str, dict]:
    return {u["id"]: u for u in paginate("users.list", {"limit": 1000}, "members")}


def channel_label(c: dict, users: dict[str, dict] | None = None) -> str:
    if c.get("is_im"):
        u = (users or {}).get(c.get("user", ""), {})
        return f"@{u.get('name') or c.get('user')}"
    if c.get("is_mpim"):
        return c.get("name", "(mpim)")
    return f"#{c.get('name', '')}"


def preview(text: str | None, max_len: int = 120) -> str:
    if not text:
        return ""
    line = text.replace("\n", " ").strip()
    return line if len(line) <= max_len else line[: max_len - 1] + "…"


def resolve_user_id(name_or_id: str) -> str:
    s = name_or_id.strip().lstrip("@")
    if re.match(r"^U[A-Z0-9]{6,}$", s):
        return s
    for u in paginate("users.list", {"limit": 1000}, "members"):
        if u.get("name") == s or u.get("profile", {}).get("display_name") == s or u.get("real_name") == s:
            return u["id"]
    raise SystemExit(f"user not found: {name_or_id}")


def parse_when(s: str) -> int:
    """Parse a time string into a unix epoch int. Accepts:
    - unix epoch ("1735689600")
    - ISO datetime ("2025-12-31T09:00", "2025-12-31 09:00+10:00")
    - relative offset ("+30m", "+2h", "+1d")
    """
    from datetime import datetime, timezone
    s = s.strip()
    if s.isdigit():
        return int(s)
    m = re.match(r"^\+?(\d+)([smhd])$", s.lower())
    if m:
        n = int(m.group(1))
        mult = {"s": 1, "m": 60, "h": 3600, "d": 86400}[m.group(2)]
        return int(time.time()) + n * mult
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError:
        pass
    raise SystemExit(f"can't parse time: {s!r} (use unix epoch, ISO datetime, or +Nm/+Nh/+Nd)")


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
    users = user_map() if any(c.get("is_im") for c in chans) else {}
    out = []
    for c in chans:
        name = channel_label(c, users)
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


def _attach_threads(cid: str, msgs: list[dict], log: bool = False, workers: int = 8) -> None:
    targets = [m for m in msgs if m.get("thread_ts") and m.get("reply_count", 0) > 0]
    if not targets:
        return
    if log:
        print(f"  fetching {len(targets)} threads (workers={workers})", file=sys.stderr)
    replies = parallel_map(
        lambda m: paginate("conversations.replies", {"channel": cid, "ts": m["thread_ts"], "limit": 200}, "messages"),
        targets,
        workers=workers,
    )
    for m, r in zip(targets, replies):
        m["_thread"] = r


def cmd_history(args):
    cid = resolve_channel(args.channel)
    msgs = _history(cid, args.limit, args.oldest, args.latest)
    if args.with_threads:
        _attach_threads(cid, msgs, workers=args.workers)
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


def cmd_mentions(args):
    from datetime import datetime, timedelta, timezone
    parts = [f"<@{my_user_id()}>"]
    if args.days:
        d = datetime.now(timezone.utc) - timedelta(days=args.days)
        parts.append(f"after:{d.strftime('%Y-%m-%d')}")
    if args.unread_only:
        parts.append("is:unread")
    if args.query:
        parts.append(args.query)
    q = " ".join(parts)
    data = api_call("search.messages", {"query": q, "count": args.limit, "sort": "timestamp", "sort_dir": "desc"})
    matches = data.get("messages", {}).get("matches", [])
    out = []
    for m in matches:
        c = m.get("channel") or {}
        cname = c.get("name") or c.get("id")
        prefix = "@" if c.get("is_im") else "#"
        out.append({
            "channel": f"{prefix}{cname}",
            "channel_id": c.get("id"),
            "user": m.get("username") or m.get("user"),
            "ts": m.get("ts"),
            "text": preview(m.get("text"), 200),
            "permalink": m.get("permalink"),
        })
    print(json.dumps({"query": q, "count": len(out), "matches": out}, indent=2))


def _my_conversations(max_channels: int) -> tuple[list[dict], dict[str, dict]]:
    chans_fn = lambda: paginate(
        "users.conversations",
        {"types": "public_channel,private_channel,mpim,im", "limit": 200, "exclude_archived": "true"},
        "channels",
    )
    chans, users = parallel_map(lambda fn: fn(), [chans_fn, user_map], workers=2)
    chans = chans[:max_channels]
    return chans, users


def _latest_message(cid: str) -> dict:
    hist = api_call("conversations.history", {"channel": cid, "limit": 1}).get("messages", [])
    return hist[0] if hist else {}


def _info(cid: str) -> dict:
    return api_call("conversations.info", {"channel": cid}).get("channel", {})


def cmd_unreads(args):
    chans, users = _my_conversations(args.max_channels)
    infos = parallel_map(lambda c: _info(c["id"]), chans, workers=args.workers)
    unread_chans = [(c, i) for c, i in zip(chans, infos)
                    if (i.get("unread_count_display") or i.get("unread_count") or 0) > 0]
    latests = parallel_map(lambda ci: _latest_message(ci[0]["id"]), unread_chans, workers=args.workers)
    out = []
    for (c, info), latest in zip(unread_chans, latests):
        out.append({
            "channel": channel_label(c, users),
            "channel_id": c["id"],
            "unread_count": info.get("unread_count_display") or info.get("unread_count") or 0,
            "latest_ts": latest.get("ts"),
            "latest_user": latest.get("user"),
            "latest_preview": preview(latest.get("text")),
        })
    out.sort(key=lambda x: float(x.get("latest_ts") or 0), reverse=True)
    print(json.dumps({"count": len(out), "unreads": out}, indent=2))


def cmd_activity(args):
    chans, users = _my_conversations(args.max_channels)
    latests = parallel_map(lambda c: _latest_message(c["id"]), chans, workers=args.workers)
    rows = []
    for c, m in zip(chans, latests):
        if not m:
            continue
        rows.append({
            "channel": channel_label(c, users),
            "channel_id": c["id"],
            "ts": m.get("ts"),
            "user": m.get("user"),
            "preview": preview(m.get("text")),
        })
    rows.sort(key=lambda x: float(x["ts"] or 0), reverse=True)
    out = rows[: args.limit]
    print(json.dumps({"count": len(out), "activity": out}, indent=2))


def cmd_permalink(args):
    cid = resolve_channel(args.channel)
    data = api_call("chat.getPermalink", {"channel": cid, "message_ts": args.ts})
    print(json.dumps({"permalink": data.get("permalink"), "channel": cid, "ts": args.ts}, indent=2))


def cmd_mark_read(args):
    cid = resolve_channel(args.channel)
    ts = args.ts
    if not ts:
        hist = api_call("conversations.history", {"channel": cid, "limit": 1}).get("messages", [])
        if not hist:
            sys.exit("no messages in channel to mark")
        ts = hist[0]["ts"]
    api_call("conversations.mark", {"channel": cid, "ts": ts}, post=True)
    print(json.dumps({"ok": True, "channel": cid, "ts": ts}, indent=2))


# -- authoring --------------------------------------------------------------

def cmd_edit(args):
    cid = resolve_channel(args.channel)
    data = api_call("chat.update", {"channel": cid, "ts": args.ts, "text": args.text}, post=True)
    print(json.dumps({"ok": True, "channel": data.get("channel"), "ts": data.get("ts")}, indent=2))


def cmd_delete(args):
    cid = resolve_channel(args.channel)
    api_call("chat.delete", {"channel": cid, "ts": args.ts}, post=True)
    print(json.dumps({"ok": True, "deleted": args.ts, "channel": cid}, indent=2))


def cmd_upload(args):
    cid = resolve_channel(args.channel)
    path = Path(args.path).expanduser()
    if not path.exists():
        sys.exit(f"file not found: {path}")
    name = args.title or path.name
    size = path.stat().st_size
    init = api_call("files.getUploadURLExternal", {"filename": path.name, "length": str(size)})
    upload_url = init["upload_url"]
    file_id = init["file_id"]
    with path.open("rb") as f:
        r = _session.post(upload_url, data=f.read(), timeout=300)
        r.raise_for_status()
    payload: dict[str, Any] = {
        "files": json.dumps([{"id": file_id, "title": name}]),
        "channel_id": cid,
    }
    if args.comment:
        payload["initial_comment"] = args.comment
    if args.thread:
        payload["thread_ts"] = args.thread
    data = api_call("files.completeUploadExternal", payload, post=True)
    fobj = (data.get("files") or [{}])[0]
    print(json.dumps({"ok": True, "file_id": fobj.get("id", file_id), "name": name, "permalink": fobj.get("permalink")}, indent=2))


def cmd_schedule(args):
    cid = resolve_channel(args.channel)
    post_at = parse_when(args.at)
    data = api_call("chat.scheduleMessage", {"channel": cid, "text": args.text, "post_at": str(post_at)}, post=True)
    print(json.dumps({"ok": True, "scheduled_message_id": data.get("scheduled_message_id"), "channel": cid, "post_at": post_at}, indent=2))


# -- catch-up extras --------------------------------------------------------

def cmd_digest(args):
    from datetime import datetime, timezone, timedelta
    after = (datetime.now(timezone.utc) - timedelta(days=args.days)).strftime("%Y-%m-%d")
    uid = my_user_id()

    # Phase 1: independent fetches in parallel
    mentions_fn = lambda: api_call("search.messages", {"query": f"<@{uid}> after:{after}", "count": args.mentions_limit, "sort": "timestamp", "sort_dir": "desc"})
    chans_fn = lambda: paginate("users.conversations", {"types": "public_channel,private_channel,mpim,im", "limit": 200, "exclude_archived": "true"}, "channels")
    mentions_data, all_chans, users = parallel_map(lambda f: f(), [mentions_fn, chans_fn, user_map], workers=3)
    chans = all_chans[: args.max_channels]

    # Phase 2: fan out per-channel info + latest in one pool
    tasks: list[tuple[dict, str]] = [(c, "info") for c in chans] + [(c, "latest") for c in chans]
    def fetch(t):
        c, kind = t
        return (c["id"], kind, _info(c["id"]) if kind == "info" else _latest_message(c["id"]))
    rows = parallel_map(fetch, tasks, workers=args.workers)
    infos = {cid: r for cid, k, r in rows if k == "info"}
    latests = {cid: r for cid, k, r in rows if k == "latest"}

    # Build sections
    mention_matches = (mentions_data.get("messages") or {}).get("matches") or []
    mentions = []
    for m in mention_matches[: args.mentions_limit]:
        c = m.get("channel") or {}
        prefix = "@" if c.get("is_im") else "#"
        mentions.append({
            "channel": f"{prefix}{c.get('name') or c.get('id')}",
            "user": m.get("username") or m.get("user"),
            "ts": m.get("ts"),
            "text": preview(m.get("text"), 160),
            "permalink": m.get("permalink"),
        })

    unreads = []
    for c in chans:
        info = infos.get(c["id"], {})
        u = info.get("unread_count_display") or info.get("unread_count") or 0
        if u > 0:
            unreads.append({"channel": channel_label(c, users), "channel_id": c["id"], "unread_count": u})
    unreads.sort(key=lambda x: x["unread_count"], reverse=True)
    unreads = unreads[: args.unreads_limit]

    activity = []
    for c in chans:
        m = latests.get(c["id"]) or {}
        if not m:
            continue
        activity.append({
            "channel": channel_label(c, users),
            "ts": m.get("ts"),
            "user": m.get("user"),
            "preview": preview(m.get("text")),
        })
    activity.sort(key=lambda x: float(x["ts"] or 0), reverse=True)
    activity = activity[: args.activity_limit]

    print(json.dumps({"days": args.days, "mentions": mentions, "unreads": unreads, "activity": activity}, indent=2))


def cmd_from(args):
    from datetime import datetime, timezone, timedelta
    uname = args.user.lstrip("@")
    parts = [f"from:@{uname}"]
    if args.days:
        d = (datetime.now(timezone.utc) - timedelta(days=args.days)).strftime("%Y-%m-%d")
        parts.append(f"after:{d}")
    if args.channel:
        ch = args.channel if args.channel.startswith(("#", "@")) else f"#{args.channel}"
        parts.append(f"in:{ch}")
    if args.query:
        parts.append(args.query)
    q = " ".join(parts)
    data = api_call("search.messages", {"query": q, "count": args.limit, "sort": "timestamp", "sort_dir": "desc"})
    matches = (data.get("messages") or {}).get("matches") or []
    out = []
    for m in matches:
        c = m.get("channel") or {}
        prefix = "@" if c.get("is_im") else "#"
        out.append({
            "channel": f"{prefix}{c.get('name') or c.get('id')}",
            "ts": m.get("ts"),
            "text": preview(m.get("text"), 200),
            "permalink": m.get("permalink"),
        })
    print(json.dumps({"query": q, "count": len(out), "matches": out}, indent=2))


def cmd_pins(args):
    cid = resolve_channel(args.channel)
    items = api_call("pins.list", {"channel": cid}).get("items", [])
    out = []
    for it in items:
        m = it.get("message") or {}
        out.append({
            "type": it.get("type"),
            "ts": m.get("ts"),
            "user": m.get("user"),
            "text": preview(m.get("text"), 200),
            "permalink": m.get("permalink"),
        })
    print(json.dumps({"count": len(out), "pins": out}, indent=2))


def cmd_bookmarks(args):
    cid = resolve_channel(args.channel)
    bookmarks = api_call("bookmarks.list", {"channel_id": cid}).get("bookmarks", [])
    out = [
        {
            "id": b.get("id"),
            "title": b.get("title"),
            "link": b.get("link"),
            "emoji": b.get("emoji"),
            "type": b.get("type"),
        }
        for b in bookmarks
    ]
    print(json.dumps({"count": len(out), "bookmarks": out}, indent=2))


# -- presence ---------------------------------------------------------------

def cmd_set_status(args):
    emoji = args.emoji or ""
    if emoji and not emoji.startswith(":"):
        emoji = f":{emoji.strip(':')}:"
    profile = {"status_text": args.text, "status_emoji": emoji, "status_expiration": args.expires or 0}
    api_call("users.profile.set", {"profile": profile}, post=True)
    print(json.dumps({"ok": True, "profile": profile}, indent=2))


def cmd_snooze(args):
    data = api_call("dnd.setSnooze", {"num_minutes": str(args.minutes)}, post=True)
    print(json.dumps({"ok": True, "snooze_endtime": data.get("snooze_endtime")}, indent=2))


def cmd_unsnooze(args):
    api_call("dnd.endSnooze", {}, post=True)
    print(json.dumps({"ok": True}))


# -- membership -------------------------------------------------------------

def cmd_members(args):
    cid = resolve_channel(args.channel)
    member_ids = paginate("conversations.members", {"channel": cid, "limit": 200}, "members")
    users = user_map()
    out = []
    for uid in member_ids:
        u = users.get(uid, {})
        out.append({
            "id": uid,
            "name": u.get("name"),
            "real_name": u.get("real_name"),
            "is_bot": u.get("is_bot", False),
        })
    print(json.dumps({"count": len(out), "members": out}, indent=2))


def cmd_join(args):
    cid = resolve_channel(args.channel)
    api_call("conversations.join", {"channel": cid}, post=True)
    print(json.dumps({"ok": True, "joined": cid}, indent=2))


def cmd_leave(args):
    cid = resolve_channel(args.channel)
    api_call("conversations.leave", {"channel": cid}, post=True)
    print(json.dumps({"ok": True, "left": cid}, indent=2))


def cmd_invite(args):
    cid = resolve_channel(args.channel)
    uids = ",".join(resolve_user_id(u) for u in args.users)
    api_call("conversations.invite", {"channel": cid, "users": uids}, post=True)
    print(json.dumps({"ok": True, "channel": cid, "invited": args.users}, indent=2))


# -- recall -----------------------------------------------------------------

def cmd_reminders(args):
    reminders = api_call("reminders.list", {}).get("reminders", [])
    out = [
        {
            "id": r.get("id"),
            "text": r.get("text"),
            "time": r.get("time"),
            "complete_ts": r.get("complete_ts"),
            "recurring": r.get("recurring"),
        }
        for r in reminders
    ]
    print(json.dumps({"count": len(out), "reminders": out}, indent=2))


def cmd_set_reminder(args):
    payload = {"text": args.text, "time": args.at}
    data = api_call("reminders.add", payload, post=True)
    rem = data.get("reminder", {})
    print(json.dumps({"ok": True, "id": rem.get("id"), "time": rem.get("time"), "text": rem.get("text")}, indent=2))


def cmd_saved(args):
    items = api_call("stars.list", {"count": args.limit}).get("items", [])
    out = []
    for it in items:
        m = it.get("message") or {}
        ch = it.get("channel") or {}
        out.append({
            "type": it.get("type"),
            "channel": ch if isinstance(ch, str) else (ch.get("id") if isinstance(ch, dict) else None),
            "ts": m.get("ts") or it.get("date_create"),
            "text": preview(m.get("text"), 200),
            "permalink": m.get("permalink"),
        })
    print(json.dumps({"count": len(out), "saved": out}, indent=2))


# -- files ------------------------------------------------------------------

_FILE_ID_RE = re.compile(r"\bF[A-Z0-9]{6,}\b")


def _extract_file_id(s: str) -> str:
    m = _FILE_ID_RE.search(s)
    if not m:
        sys.exit(f"can't find a Slack file ID in: {s!r}")
    return m.group(0)


def download_file(file_id: str, output: Path | None = None) -> tuple[Path, dict]:
    """Download a file by ID. Returns (saved_path, file_info)."""
    info = api_call("files.info", {"file": file_id}).get("file", {})
    url = info.get("url_private_download") or info.get("url_private")
    if not url:
        raise SystemExit(f"file {file_id} has no download URL (may be external or deleted)")
    name = info.get("name") or f"{file_id}.bin"
    if output is None:
        output = Path.cwd() / name
    elif output.is_dir():
        output = output / name
    output.parent.mkdir(parents=True, exist_ok=True)

    token, cookie = load_credentials()
    headers = {"Authorization": f"Bearer {token}"}
    cookies = {"d": cookie} if cookie else None
    with _session.get(url, headers=headers, cookies=cookies, stream=True, timeout=300) as r:
        r.raise_for_status()
        with output.open("wb") as f:
            for chunk in r.iter_content(8192):
                if chunk:
                    f.write(chunk)
    return output, info


def cmd_files(args):
    params: dict[str, Any] = {"count": args.limit, "page": args.page}
    if args.channel:
        params["channel"] = resolve_channel(args.channel)
    if args.user:
        params["user"] = resolve_user_id(args.user)
    if args.types:
        params["types"] = args.types
    if args.from_ts:
        params["ts_from"] = args.from_ts
    if args.to_ts:
        params["ts_to"] = args.to_ts
    data = api_call("files.list", params)
    out = []
    for f in data.get("files", []):
        out.append({
            "id": f.get("id"),
            "name": f.get("name"),
            "title": f.get("title"),
            "filetype": f.get("filetype"),
            "mimetype": f.get("mimetype"),
            "size": f.get("size"),
            "user": f.get("user"),
            "channels": f.get("channels"),
            "created": f.get("created"),
            "permalink": f.get("permalink"),
        })
    paging = data.get("paging") or {}
    print(json.dumps({"count": len(out), "page": paging.get("page"), "pages": paging.get("pages"), "files": out}, indent=2))


def cmd_download(args):
    fid = _extract_file_id(args.file)
    out = Path(args.output).expanduser() if args.output else None
    saved, info = download_file(fid, out)
    print(json.dumps({
        "ok": True,
        "file_id": fid,
        "name": info.get("name"),
        "filetype": info.get("filetype"),
        "size": saved.stat().st_size,
        "saved_to": str(saved),
    }, indent=2))


def _collect_file_ids(msgs: list[dict]) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    def walk(m: dict):
        for f in (m.get("files") or []):
            fid = f.get("id")
            if fid and fid not in seen:
                seen.add(fid)
                ids.append(fid)
    for m in msgs:
        walk(m)
        for t in (m.get("_thread") or []):
            walk(t)
    return ids


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
        _attach_threads(cid, msgs, log=True, workers=args.workers)

    file_count = 0
    if args.with_files:
        ids = _collect_file_ids(msgs)
        if ids:
            files_dir = out_dir / "files"
            files_dir.mkdir(exist_ok=True)
            print(f"  downloading {len(ids)} files → {files_dir}", file=sys.stderr)
            results = parallel_map(lambda fid: download_file(fid, files_dir), ids, workers=args.workers)
            file_count = len(results)

    (out_dir / "channel.json").write_text(json.dumps(info, indent=2))
    (out_dir / "messages.json").write_text(json.dumps(msgs, indent=2))
    print(json.dumps({"ok": True, "messages": len(msgs), "files": file_count, "output": str(out_dir)}, indent=2))


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
        # catch-up
        ("whoami", "Show identity"),
        ("digest", "Catch-up digest (mentions + unreads + activity)"),
        ("activity", "Recent activity across your conversations"),
        ("unreads", "Conversations with unread messages"),
        ("mentions", "Messages that mention you"),
        # browse
        ("channels", "List channels / DMs"),
        ("users", "List users"),
        ("history", "Read message history"),
        ("from", "Messages from a specific user"),
        ("search", "Search messages"),
        ("info", "Channel info"),
        # write
        ("send", "Send a message"),
        ("edit", "Edit a message"),
        ("delete", "Delete a message"),
        ("react", "Add a reaction"),
        ("upload", "Upload a file"),
        ("schedule", "Schedule a message"),
        # channel actions
        ("permalink", "Get permalink for a message"),
        ("mark-read", "Mark channel/DM as read"),
        ("pins", "List pinned messages"),
        ("bookmarks", "List channel bookmarks"),
        ("members", "List channel members"),
        ("join", "Join a channel"),
        ("leave", "Leave a channel"),
        ("invite", "Invite users to a channel"),
        # presence
        ("set-status", "Set your status"),
        ("snooze", "Enable DnD for N minutes"),
        ("unsnooze", "End DnD"),
        # recall
        ("reminders", "List your reminders"),
        ("set-reminder", "Create a reminder"),
        ("saved", "List saved-for-later items"),
        # files
        ("files", "List files (attachments)"),
        ("download", "Download a file by ID/permalink"),
        # export / exit
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
                cmd_history(argparse.Namespace(channel=c, limit=n, oldest=None, latest=None, with_threads=wt, workers=8))
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
            elif key == "activity":
                n = int(_prompt("limit", "20"))
                cmd_activity(argparse.Namespace(limit=n, max_channels=100, workers=8))
            elif key == "unreads":
                cmd_unreads(argparse.Namespace(max_channels=100, workers=8))
            elif key == "mentions":
                d = int(_prompt("days back", "14"))
                u = _prompt("unread only? (y/N)", "n").lower().startswith("y")
                n = int(_prompt("limit", "50"))
                cmd_mentions(argparse.Namespace(days=d, unread_only=u, query=None, limit=n))
            elif key == "permalink":
                c = _prompt("channel")
                ts = _prompt("message ts")
                cmd_permalink(argparse.Namespace(channel=c, ts=ts))
            elif key == "mark-read":
                c = _prompt("channel")
                ts = _prompt("ts (blank = latest)") or None
                cmd_mark_read(argparse.Namespace(channel=c, ts=ts))
            elif key == "info":
                c = _prompt("channel")
                cmd_info(argparse.Namespace(channel=c))
            elif key == "export":
                c = _prompt("channel")
                o = _prompt("output dir (blank for auto)") or None
                wt = _prompt("with threads? (Y/n)", "y").lower().startswith("y")
                cmd_export(argparse.Namespace(channel=c, output=o, with_threads=wt, workers=8))
            elif key == "digest":
                d = int(_prompt("days back", "1"))
                cmd_digest(argparse.Namespace(days=d, mentions_limit=15, unreads_limit=15, activity_limit=10, max_channels=100, workers=8))
            elif key == "from":
                u = _prompt("user (@name or U-ID)")
                d = int(_prompt("days back", "14"))
                ch = _prompt("restrict to channel (blank for any)") or None
                n = int(_prompt("limit", "50"))
                cmd_from(argparse.Namespace(user=u, days=d, channel=ch, query=None, limit=n))
            elif key == "edit":
                c = _prompt("channel"); ts = _prompt("message ts"); t = input("new text: ")
                if _prompt(f"edit {ts} in {c}? (y/N)", "n").lower().startswith("y"):
                    cmd_edit(argparse.Namespace(channel=c, ts=ts, text=t))
            elif key == "delete":
                c = _prompt("channel"); ts = _prompt("message ts")
                if _prompt(f"delete {ts} in {c}? (y/N)", "n").lower().startswith("y"):
                    cmd_delete(argparse.Namespace(channel=c, ts=ts))
            elif key == "upload":
                c = _prompt("channel"); p = _prompt("file path")
                cm = _prompt("initial comment (blank for none)") or None
                ti = _prompt("title (blank = filename)") or None
                th = _prompt("thread ts (blank for none)") or None
                cmd_upload(argparse.Namespace(channel=c, path=p, comment=cm, title=ti, thread=th))
            elif key == "schedule":
                c = _prompt("channel"); t = input("message: ")
                at = _prompt("at (unix / ISO / +Nh)")
                cmd_schedule(argparse.Namespace(channel=c, text=t, at=at))
            elif key == "pins":
                cmd_pins(argparse.Namespace(channel=_prompt("channel")))
            elif key == "bookmarks":
                cmd_bookmarks(argparse.Namespace(channel=_prompt("channel")))
            elif key == "members":
                cmd_members(argparse.Namespace(channel=_prompt("channel")))
            elif key == "join":
                c = _prompt("channel")
                if _prompt(f"join {c}? (y/N)", "n").lower().startswith("y"):
                    cmd_join(argparse.Namespace(channel=c))
            elif key == "leave":
                c = _prompt("channel")
                if _prompt(f"leave {c}? (y/N)", "n").lower().startswith("y"):
                    cmd_leave(argparse.Namespace(channel=c))
            elif key == "invite":
                c = _prompt("channel")
                users_in = _prompt("users (space-separated)").split()
                cmd_invite(argparse.Namespace(channel=c, users=users_in))
            elif key == "set-status":
                t = _prompt("status text (blank to clear)")
                em = _prompt("emoji (blank for none)") or None
                ex = int(_prompt("expires unix ts (0 = never)", "0"))
                cmd_set_status(argparse.Namespace(text=t, emoji=em, expires=ex))
            elif key == "snooze":
                m = int(_prompt("minutes", "60"))
                cmd_snooze(argparse.Namespace(minutes=m))
            elif key == "unsnooze":
                cmd_unsnooze(argparse.Namespace())
            elif key == "reminders":
                cmd_reminders(argparse.Namespace())
            elif key == "set-reminder":
                t = input("reminder text: ")
                at = _prompt("when ('in 30 min', 'tomorrow at 9am', unix ts)")
                cmd_set_reminder(argparse.Namespace(text=t, at=at))
            elif key == "saved":
                n = int(_prompt("limit", "50"))
                cmd_saved(argparse.Namespace(limit=n))
            elif key == "files":
                ch = _prompt("channel (blank for any)") or None
                u = _prompt("user (blank for any)") or None
                ty = _prompt("types (blank for all)") or None
                n = int(_prompt("limit", "100"))
                cmd_files(argparse.Namespace(channel=ch, user=u, types=ty, limit=n, page=1, from_ts=None, to_ts=None))
            elif key == "download":
                fid = _prompt("file ID or permalink")
                o = _prompt("output (blank = ./<filename>)") or None
                cmd_download(argparse.Namespace(file=fid, output=o))
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
    h.add_argument("--workers", type=int, default=8, help="parallel thread fetches")
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

    mn = sub.add_parser("mentions", help="messages that mention you (search.messages)")
    mn.add_argument("--days", type=int, default=14, help="window in days (0 = no time filter)")
    mn.add_argument("--unread-only", action="store_true")
    mn.add_argument("--query", help="extra search modifiers, e.g. 'in:#general'")
    mn.add_argument("--limit", type=int, default=50)
    mn.set_defaults(func=cmd_mentions)

    un = sub.add_parser("unreads", help="conversations with unread messages")
    un.add_argument("--max-channels", type=int, default=100, help="how many of your conversations to scan")
    un.add_argument("--workers", type=int, default=8, help="parallel per-channel fetches")
    un.set_defaults(func=cmd_unreads)

    ac = sub.add_parser("activity", help="your conversations sorted by latest message")
    ac.add_argument("--limit", type=int, default=20)
    ac.add_argument("--max-channels", type=int, default=100)
    ac.add_argument("--workers", type=int, default=8, help="parallel per-channel fetches")
    ac.set_defaults(func=cmd_activity)

    pl = sub.add_parser("permalink", help="get the permalink URL for a message")
    pl.add_argument("channel")
    pl.add_argument("ts")
    pl.set_defaults(func=cmd_permalink)

    mr = sub.add_parser("mark-read", help="mark a channel/DM as read up to a message")
    mr.add_argument("channel")
    mr.add_argument("--ts", help="message ts to mark up to (default: latest message)")
    mr.set_defaults(func=cmd_mark_read)

    ed = sub.add_parser("edit", help="edit a message you sent (chat.update)")
    ed.add_argument("channel")
    ed.add_argument("ts")
    ed.add_argument("text")
    ed.set_defaults(func=cmd_edit)

    de = sub.add_parser("delete", help="delete a message (chat.delete)")
    de.add_argument("channel")
    de.add_argument("ts")
    de.set_defaults(func=cmd_delete)

    up = sub.add_parser("upload", help="upload a file (files.getUploadURLExternal flow)")
    up.add_argument("channel")
    up.add_argument("path")
    up.add_argument("--comment", help="initial_comment shown with the file")
    up.add_argument("--title", help="display title (default: filename)")
    up.add_argument("--thread", help="thread_ts to post into")
    up.set_defaults(func=cmd_upload)

    sc = sub.add_parser("schedule", help="schedule a message (chat.scheduleMessage)")
    sc.add_argument("channel")
    sc.add_argument("text")
    sc.add_argument("--at", required=True, help="unix epoch, ISO datetime, or +Nm/+Nh/+Nd")
    sc.set_defaults(func=cmd_schedule)

    dg = sub.add_parser("digest", help="combined catch-up: mentions + unreads + activity")
    dg.add_argument("--days", type=int, default=1, help="mentions look-back window in days")
    dg.add_argument("--mentions-limit", type=int, default=15)
    dg.add_argument("--unreads-limit", type=int, default=15)
    dg.add_argument("--activity-limit", type=int, default=10)
    dg.add_argument("--max-channels", type=int, default=100)
    dg.add_argument("--workers", type=int, default=8)
    dg.set_defaults(func=cmd_digest)

    fr = sub.add_parser("from", help="search messages by a specific user")
    fr.add_argument("user", help="@name, name, or U-ID")
    fr.add_argument("--days", type=int, default=14)
    fr.add_argument("--channel", help="restrict to one channel (#name or @user)")
    fr.add_argument("--query", help="extra search modifiers")
    fr.add_argument("--limit", type=int, default=50)
    fr.set_defaults(func=cmd_from)

    pn = sub.add_parser("pins", help="list pinned messages in a channel")
    pn.add_argument("channel")
    pn.set_defaults(func=cmd_pins)

    bm = sub.add_parser("bookmarks", help="list channel bookmark links")
    bm.add_argument("channel")
    bm.set_defaults(func=cmd_bookmarks)

    ss = sub.add_parser("set-status", help="set your Slack status (users.profile.set)")
    ss.add_argument("text", help="status text (empty string to clear)")
    ss.add_argument("--emoji", help="emoji name (with or without colons)")
    ss.add_argument("--expires", type=int, default=0, help="unix epoch when status auto-clears (0 = never)")
    ss.set_defaults(func=cmd_set_status)

    sn = sub.add_parser("snooze", help="enable DnD for N minutes")
    sn.add_argument("minutes", type=int)
    sn.set_defaults(func=cmd_snooze)

    sub.add_parser("unsnooze", help="end DnD").set_defaults(func=cmd_unsnooze)

    mb = sub.add_parser("members", help="list channel members with names")
    mb.add_argument("channel")
    mb.set_defaults(func=cmd_members)

    jn = sub.add_parser("join", help="join a channel")
    jn.add_argument("channel")
    jn.set_defaults(func=cmd_join)

    lv = sub.add_parser("leave", help="leave a channel")
    lv.add_argument("channel")
    lv.set_defaults(func=cmd_leave)

    iv = sub.add_parser("invite", help="invite users to a channel")
    iv.add_argument("channel")
    iv.add_argument("users", nargs="+", help="one or more @name / name / U-ID")
    iv.set_defaults(func=cmd_invite)

    rm = sub.add_parser("reminders", help="list your reminders (reminders.list)")
    rm.set_defaults(func=cmd_reminders)

    sr = sub.add_parser("set-reminder", help="create a reminder for yourself (reminders.add)")
    sr.add_argument("text")
    sr.add_argument("--at", required=True, help="Slack natural-language time ('in 30 min', 'tomorrow at 9am') or unix epoch")
    sr.set_defaults(func=cmd_set_reminder)

    sv = sub.add_parser("saved", help="list saved-for-later items (stars.list)")
    sv.add_argument("--limit", type=int, default=50)
    sv.set_defaults(func=cmd_saved)

    fl = sub.add_parser("files", help="list files (files.list)")
    fl.add_argument("--channel", help="restrict to one channel")
    fl.add_argument("--user", help="restrict to one user (@name or U-ID)")
    fl.add_argument("--types", help="comma list: images,pdfs,snippets,spaces,zips,etc")
    fl.add_argument("--limit", type=int, default=100)
    fl.add_argument("--page", type=int, default=1)
    fl.add_argument("--from-ts", help="unix ts lower bound (ts_from)")
    fl.add_argument("--to-ts", help="unix ts upper bound (ts_to)")
    fl.set_defaults(func=cmd_files)

    dl = sub.add_parser("download", help="download a file by ID or permalink")
    dl.add_argument("file", help="Slack file ID (F…) or a permalink containing one")
    dl.add_argument("--output", help="output path (file or directory; default: ./<filename>)")
    dl.set_defaults(func=cmd_download)

    e = sub.add_parser("export", help="export full channel history to JSON files")
    e.add_argument("channel")
    e.add_argument("--output", help="output directory (default: ./slack_export_<name>_<ts>)")
    e.add_argument("--with-threads", action="store_true")
    e.add_argument("--with-files", action="store_true", help="also download every attached file to <output>/files/")
    e.add_argument("--workers", type=int, default=8, help="parallel thread / file fetches")
    e.set_defaults(func=cmd_export)

    return p


def main():
    global _PROFILE
    args = build_parser().parse_args()
    _PROFILE = args.profile
    args.func(args)


if __name__ == "__main__":
    main()
