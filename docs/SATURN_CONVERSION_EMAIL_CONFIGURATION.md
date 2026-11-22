# Guest conversion email (hosted Supabase)

The repository template is `supabase/templates/email-change.html`. Hosted Auth must be configured in the Supabase Dashboard: Authentication → Email Templates → Change email address. Subject: Verify your email | ProPeloton Manager. Paste the HTML body and save. The conditional preserves the regular email-change use case. Leave secure email change enabled. Never replace the ConfirmationURL with an unverified link.

Authentication → URL Configuration → Redirect URLs: allow `https://propelotonmanager.com/?saturn_email_link=1#/test-account-register`. Keep existing URLs and Site URL unchanged. The frontend also handles confirmed original guest sessions returned to the homepage. Test delivery in the same browser; no production secrets are needed.

The hosted template and allowlist are separate from Netlify deployment and must be applied in the dashboard.
