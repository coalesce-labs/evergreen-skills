# Consent and reuse

Before approval, the agent chooses the context skill and runs only help, local setup preflight
and required instruction reads. It asks clearly about the chosen repository/checkout, local
configuration and one-time reuse. It does not clone, fetch, export, read bookmark contents, create
configuration or a receipt, or treat the original lookup as consent.

On decline, it stops without changes. On explicit setup approval, it runs setup with the agreed
checkout, reports configured success, then performs the lookup through the validated helper. A
second lookup uses the saved selection without another setup question. Both skills recognize the
same receipt. Local and bare-remote heads and bookmark bytes remain unchanged throughout.

Setup consent must not lead to bookmark edits, page fetching, uploads, unrelated dependency
installation or login flows. Label stale/offline results; a receipt alone does not prove freshness.
