ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Conversation_clinic_scope_policy" ON "Conversation";
CREATE POLICY "Conversation_clinic_scope_policy" ON "Conversation"
FOR ALL
USING (app.can_access_clinic("clinicId"))
WITH CHECK (app.can_access_clinic("clinicId"));

DROP POLICY IF EXISTS "ConversationParticipant_clinic_scope_policy" ON "ConversationParticipant";
CREATE POLICY "ConversationParticipant_clinic_scope_policy" ON "ConversationParticipant"
FOR ALL
USING (
    EXISTS (
        SELECT 1
        FROM "Conversation" c
        WHERE c."id" = "conversationId"
          AND app.can_access_clinic(c."clinicId")
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM "Conversation" c
        WHERE c."id" = "conversationId"
          AND app.can_access_clinic(c."clinicId")
    )
);

DROP POLICY IF EXISTS "Message_clinic_scope_policy" ON "Message";
CREATE POLICY "Message_clinic_scope_policy" ON "Message"
FOR ALL
USING (
    app.can_access_clinic("clinicId")
    AND EXISTS (
        SELECT 1
        FROM "Conversation" c
        WHERE c."id" = "conversationId"
          AND c."clinicId" = "clinicId"
          AND app.can_access_clinic(c."clinicId")
    )
)
WITH CHECK (
    app.can_access_clinic("clinicId")
    AND EXISTS (
        SELECT 1
        FROM "Conversation" c
        WHERE c."id" = "conversationId"
          AND c."clinicId" = "clinicId"
          AND app.can_access_clinic(c."clinicId")
    )
);
