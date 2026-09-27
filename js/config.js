// Site configuration.
window.SITE_CONFIG = {
  // Support address shown on the Support page. Leave empty until the mailbox exists (the page falls back to the issue tracker).
  contactEmail: "support@deductbook.com",

  // Cloud mode: accounts, household ledgers, private receipt storage, live sync.
  // Leave both empty to run in device-only mode. See README → "Accounts and household ledgers".
  cloud: {
    url: "https://wmrzuqamnnsurubalfqb.supabase.co",           // production project (deductbook)
    anonKey: "sb_publishable_vOyIiNtXwIy4WlPldYu4Jw_VGe76Zz0"   // the project's PUBLISHABLE key (or legacy anon key). Both are client-side keys meant to ship
                   // in the page; row-level security does the protecting. NEVER put a secret / service_role key here.
  },

  // Plans (household-level; invited members never pay separately). Enforcement is server-side via
  // households.plan_status; these values only drive the wording shown to users.
  plans: {
    betaFree: true,                    // show the free-beta notice with the intended price
    intendedPrice: "$19/year",         // a price to test, not a settled number
    retentionNote: "If you stop paying, your records and exports stay available; only adding and sharing pause."
  },

  // Optional "support this site" ask. Set enabled to true once you've added at least one link.
  // Links open in a new tab. Nothing is gated behind it.
  support: {
    enabled: false,
    heading: "Support DeductBook",
    message: "DeductBook is free to use. If it saved you time at tax season, a tip of any size keeps it online — entirely optional.",
    footer: "Free to use. If it helped, a small tip keeps it running.",
    links: [
      // { label: "Buy me a coffee", url: "https://buymeacoffee.com/yourname" },
      // { label: "Ko-fi", url: "https://ko-fi.com/yourname" },
      // { label: "PayPal", url: "https://paypal.me/yourname" }
    ]
  }
};
