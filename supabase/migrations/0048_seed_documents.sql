-- Seed initial org_documents entries
INSERT INTO org_documents (title, category, url, sort_order)
VALUES (
  'Bookkeeper',
  'Staff Roles',
  'https://docs.google.com/document/d/1e9b8r8XYaAj1g4dTrsd4fOPPHJtqDHNz/edit?usp=sharing&ouid=100623315514963899522&rtpof=true&sd=true',
  0
)
ON CONFLICT DO NOTHING;
