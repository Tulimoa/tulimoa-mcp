# Listing Examples

This folder contains ready-to-edit JSON-RPC payloads for Tulimoa write tools.

Use them to check that a listing has:

- a valid public homepage URL
- one current category id from `list_categories`
- a short description under 300 characters
- no credentials, screenshots, or private notes in public fields

Validate an example before calling a write tool:

```bash
python3 -m json.tool examples/xquik-submit-listing.json >/dev/null
```

After submission, use the returned slug to track the pending listing through the
review flow.
