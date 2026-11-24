-- Ligue : matchs nuls autorisés ou non, choix du créateur du tournoi (faux par défaut, donc sans effet sur l'existant).
ALTER TABLE "Tournament" ADD COLUMN "allowDraws" BOOLEAN NOT NULL DEFAULT false;
