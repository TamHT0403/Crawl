-- CreateIndex
CREATE INDEX "Post_platform_publishedAt_idx" ON "Post"("platform", "publishedAt");

-- CreateIndex
CREATE INDEX "Post_competitorId_publishedAt_idx" ON "Post"("competitorId", "publishedAt");

-- CreateIndex
CREATE INDEX "Post_platform_engagementRate_idx" ON "Post"("platform", "engagementRate" DESC);
