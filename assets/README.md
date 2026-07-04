# Email attachments (optional)

Attachments are **optional**. Put any files you want attached to **every**
outreach draft into the **`attachments/`** subfolder:

```
assets/attachments/your-brochure.pdf
assets/attachments/case-study.pdf
```

- Every file in `assets/attachments/` is attached to each Gmail draft.
- Dotfiles (e.g. `.gitkeep`) are ignored, so an empty folder = **no attachment**,
  and the draft is still created.
- The folder is mounted read-only into the n8n container at
  `/home/node/.n8n-files/assets/attachments` (see `docker-compose.yml`). The
  workflow's Config `attachment_dir` points there.
- If you add files while the stack is already running, they're picked up on the
  next run (the bind mount is live — no restart needed).
