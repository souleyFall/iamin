-- Date et heure prevues du tournoi (UTC). Facultative en base : les tournois existants n'en ont pas.
ALTER TABLE "Tournament" ADD COLUMN "startsAt" TIMESTAMP(3);
