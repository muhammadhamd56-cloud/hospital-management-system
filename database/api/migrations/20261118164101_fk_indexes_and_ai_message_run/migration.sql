-- DropIndex
DROP INDEX "StaffAvailability_staffId_idx";

-- DropIndex
DROP INDEX "StaffLeave_staffId_idx";

-- CreateIndex
CREATE INDEX "AiActionProposal_runId_idx" ON "AiActionProposal"("runId");

-- CreateIndex
CREATE INDEX "AiActionProposal_decidedById_idx" ON "AiActionProposal"("decidedById");

-- CreateIndex
CREATE INDEX "AiFeedback_userId_idx" ON "AiFeedback"("userId");

-- CreateIndex
CREATE INDEX "AiMessage_runId_idx" ON "AiMessage"("runId");

-- CreateIndex
CREATE INDEX "AiRun_conversationId_status_idx" ON "AiRun"("conversationId", "status");

-- CreateIndex
CREATE INDEX "Announcement_authorId_idx" ON "Announcement"("authorId");

-- CreateIndex
CREATE INDEX "EmergencyCase_acknowledgedById_idx" ON "EmergencyCase"("acknowledgedById");

-- CreateIndex
CREATE INDEX "EmergencyCase_assignedById_idx" ON "EmergencyCase"("assignedById");

-- CreateIndex
CREATE INDEX "EmergencyCase_resolvedById_idx" ON "EmergencyCase"("resolvedById");

-- CreateIndex
CREATE INDEX "EmergencyNote_authorId_idx" ON "EmergencyNote"("authorId");

-- CreateIndex
CREATE INDEX "Payment_recordedById_idx" ON "Payment"("recordedById");

-- CreateIndex
CREATE INDEX "Refund_refundedById_idx" ON "Refund"("refundedById");

-- CreateIndex
CREATE INDEX "ShiftApplication_respondedById_idx" ON "ShiftApplication"("respondedById");

-- CreateIndex
CREATE INDEX "ShiftOpening_departmentId_idx" ON "ShiftOpening"("departmentId");

-- CreateIndex
CREATE INDEX "ShiftOpening_createdById_idx" ON "ShiftOpening"("createdById");

-- CreateIndex
CREATE INDEX "StaffShift_createdById_idx" ON "StaffShift"("createdById");

-- CreateIndex
CREATE INDEX "Task_departmentId_idx" ON "Task"("departmentId");

-- CreateIndex
CREATE INDEX "Task_assignedById_idx" ON "Task"("assignedById");

-- Clear any runId that points at a missing run so the new foreign key can be added.
UPDATE "AiMessage" SET "runId" = NULL
WHERE "runId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AiRun" r WHERE r."id" = "AiMessage"."runId");

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
