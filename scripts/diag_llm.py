"""One-shot diagnostic: why is the Gemini Tier-3 call failing?

    python scripts/diag_llm.py

Prints the resolved endpoint/model, a masked view of the key, and the FULL
error from a single live call — so we can tell a bad key (401) apart from a
network/firewall problem (connection error).
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from closeloop import llm  # noqa: E402

key = llm.api_key()
print("base_url :", llm.base_url())
print("model    :", llm.model_name())
if not key:
    print("key      : (NONE FOUND — no GEMINI_API_KEY in .env or environment)")
    sys.exit(1)
print(f"key      : {key[:6]}...{key[-4:]}  (len={len(key)}, starts with "
      f"{'AIza -> looks like a real API key' if key.startswith('AIza') else repr(key[:3]) + ' -> NOT the usual AIza... API-key format'})")

client = llm.make_client()
print("client   :", "built" if client else "NOT built")
print("-" * 60)
try:
    r = client.chat.completions.create(
        model=llm.model_name(), max_tokens=512, temperature=0,
        messages=[{"role": "user", "content": "Reply with the single word: ok"}],
    )
    choice = r.choices[0]
    content = choice.message.content
    print("finish   :", choice.finish_reason)
    print("usage    :", r.usage)
    print("content  :", repr(content))
    if content and content.strip():
        print("\n=> SUCCESS. Key/network/model all good. Run: python scripts/run_eval.py")
    else:
        print("\n=> Call worked but returned EMPTY content (reasoning ate the budget).")
        print("   Tell Claude — the adjudicator needs a bigger token budget / thinking off.")
except Exception as exc:
    print("FAILED")
    print("error type:", type(exc).__name__)
    print("error text:", str(exc)[:1000])
    status = getattr(exc, "status_code", None)
    if status is not None:
        print("http status:", status)
    print("\nHow to read this:")
    print("  * 'API key not valid' / 401 / PERMISSION_DENIED -> wrong key.")
    print("    Get one at https://aistudio.google.com/apikey (starts AIza...),")
    print("    put it in .env as GEMINI_API_KEY=, and re-run this script.")
    print("  * 'Connection error' / timeout -> network/firewall/proxy blocking")
    print("    generativelanguage.googleapis.com. Try another network.")
