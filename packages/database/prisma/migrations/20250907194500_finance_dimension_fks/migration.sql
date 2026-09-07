-- Phase 8.1: FK from journal_lines dimensions to Project / Cost Center masters

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_costCenterId_fkey"
  FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
