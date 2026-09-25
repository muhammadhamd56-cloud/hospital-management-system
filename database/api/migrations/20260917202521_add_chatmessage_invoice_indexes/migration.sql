-- CreateIndex
CREATE INDEX "ChatMessage_doctorId_patientId_idx" ON "ChatMessage"("doctorId", "patientId");

-- CreateIndex
CREATE INDEX "ChatMessage_patientId_idx" ON "ChatMessage"("patientId");

-- CreateIndex
CREATE INDEX "Invoice_patientId_idx" ON "Invoice"("patientId");
