-- Staff.email had no uniqueness guarantee, unlike User.email -- verified
-- zero duplicate non-null emails in Staff before adding this (dev DB had
-- only 2 rows; re-check row counts before applying to a populated
-- production database, same as any other constraint-adding migration).
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");
