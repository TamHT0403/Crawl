import { competitorSeeds } from "../lib/competitors";
import { prisma } from "../lib/prisma";

async function main() {
  await prisma.post.deleteMany();
  await prisma.insightReport.deleteMany();
  await prisma.competitor.deleteMany();
  await prisma.setting.deleteMany();

  await prisma.setting.createMany({
    data: [
      { key: "youtubeApiKey", value: "" },
      { key: "tiktokProviderUrl", value: "" },
      { key: "tiktokProviderToken", value: "" },
      { key: "metaGraphToken", value: "" }
    ]
  });

  for (const seed of competitorSeeds) {
    await prisma.competitor.create({
      data: {
        name: seed.name,
        platform: seed.platform,
        source: seed.source,
        segmentation: seed.segmentation,
        category: seed.category,
        topicDescription: seed.topicDescription,
        channelUrl: seed.channelUrl,
        avatarUrl: seed.avatarUrl
      }
    });
  }

  const counts = await prisma.post.groupBy({
    by: ["platform"],
    _count: { id: true }
  });

  console.table(counts.map((item) => ({ platform: item.platform, posts: item._count.id })));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
