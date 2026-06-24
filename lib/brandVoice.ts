/**
 * Brand Voice Style Transfer
 *
 * Học giọng văn của Kolia từ sample posts → điều chỉnh AI output.
 * Cho phép định nghĩa brand voice profile và apply vào content generation.
 */

import { isOpenAIConfigured, getOpenAIClient, getOpenAIModel } from "@/lib/openai";
import { prisma } from "@/lib/prisma";

export type BrandVoiceProfile = {
  id: string;
  name: string; // "Kolia Phan"
  description: string; // Mô tả giọng văn
  traits: string[]; // ["chuyên gia", "trung lập", "giáo dục"]
  avoid: string[]; // ["khuyến nghị mua/bán", "FOMO"]
  samplePosts: string[]; // Các post mẫu để học
  toneRules: Array<{
    platform: string;
    rules: string[];
  }>;
  createdAt: string;
};

const DEFAULT_KOLIA_VOICE: BrandVoiceProfile = {
  id: "kolia-default",
  name: "Kolia Phan",
  description: "Chuyên gia tài chính trung lập, tập trung giáo dục nhà đầu tư cá nhân",
  traits: ["chuyên gia", "trung lập", "giáo dục", "minh bạch", "dễ hiểu"],
  avoid: [
    "Không đưa khuyến nghị mua/bán cá nhân",
    "Không FOMO hoặc gây hoảng loạn",
    "Không hứa hẹn lợi nhuận",
  ],
  samplePosts: [],
  toneRules: [
    {
      platform: "youtube",
      rules: [
        "Mở bằng luận điểm rõ ràng, không clickbait",
        "Trình bày dữ liệu kiểm chứng (CPI, Fed, chart)",
        "Kết thúc bằng lưu ý rủi ro và CTA học tập",
      ],
    },
    {
      platform: "tiktok",
      rules: [
        "Hook 3s đầu: vấn đề cụ thể của nhà đầu tư",
        "Giải thích đơn giản, trực quan",
        "Kết: theo dõi để học thêm",
      ],
    },
    {
      platform: "facebook",
      rules: [
        "Góc nhìn khác biệt, có dữ liệu",
        "Không bán hàng trực diện",
        "CTA mời tham gia cộng đồng học tập",
      ],
    },
  ],
  createdAt: new Date().toISOString(),
};

// ─── Request-scoped cache ──────────────────────────────────────────────────

let brandVoiceCache: BrandVoiceProfile | null | undefined = undefined;

function getCached(): BrandVoiceProfile | null {
  return brandVoiceCache === undefined ? null : brandVoiceCache;
}

/**
 * Lấy brand voice profile từ DB hoặc default
 */
export async function getBrandVoice(): Promise<BrandVoiceProfile> {
  // Cache hit
  const cached = getCached();
  if (cached !== null) return cached;

  const setting = await prisma.setting.findUnique({ where: { key: "brand_voice" } });
  if (setting) {
    try {
      const profile = JSON.parse(setting.value) as BrandVoiceProfile;
      brandVoiceCache = profile;
      return profile;
    } catch {
      // Fall through to default
    }
  }

  brandVoiceCache = DEFAULT_KOLIA_VOICE;
  return DEFAULT_KOLIA_VOICE;
}

/**
 * Lưu brand voice profile
 */
export async function saveBrandVoice(profile: BrandVoiceProfile): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "brand_voice" },
    update: { value: JSON.stringify(profile) },
    create: { key: "brand_voice", value: JSON.stringify(profile) },
  });
  brandVoiceCache = profile; // update cache
}

/**
 * Học brand voice từ sample posts
 */
export async function learnBrandVoice(samplePostIds: string[]): Promise<BrandVoiceProfile> {
  if (!await isOpenAIConfigured()) {
    return DEFAULT_KOLIA_VOICE;
  }

  // Fetch sample posts
  const posts = await prisma.post.findMany({
    where: { id: { in: samplePostIds } },
    include: { competitor: true },
    take: 10,
  });

  if (posts.length === 0) return DEFAULT_KOLIA_VOICE;

  const samples = posts.map((p) =>
    `[${p.competitor.name}] "${p.title}" - ${p.caption.slice(0, 300)}`
  ).join("\n\n---\n\n");

  try {
    const client = await getOpenAIClient();
    const model = await getOpenAIModel();

    const prompt = `Phân tích giọng văn (brand voice) từ các bài viết mẫu sau. 
Đây là content của Kolia Phan — chuyên gia tài chính đầu tư.

**Sample posts**:
${samples}

Trả về JSON:
{
  "description": "mô tả giọng văn (2-3 câu)",
  "traits": ["đặc điểm 1", "đặc điểm 2", ...],
  "avoid": ["điều cần tránh 1", ...],
  "toneRules": [
    { "platform": "youtube", "rules": ["rule 1", "rule 2"] },
    { "platform": "tiktok", "rules": ["rule 1", "rule 2"] },
    { "platform": "facebook", "rules": ["rule 1", "rule 2"] }
  ]
}`;

    const response = await client.responses.create({
      model,
      input: prompt,
      instructions: "Bạn là chuyên gia brand voice analysis. Trả lời JSON thuần.",
      max_output_tokens: 800,
    });

    const jsonMatch = response.output_text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const profile: BrandVoiceProfile = {
        id: `kolia-${Date.now()}`,
        name: "Kolia Phan",
        description: parsed.description || DEFAULT_KOLIA_VOICE.description,
        traits: parsed.traits || DEFAULT_KOLIA_VOICE.traits,
        avoid: parsed.avoid || DEFAULT_KOLIA_VOICE.avoid,
        samplePosts: posts.map((p) => `"${p.title}" - ${p.competitor.name}`),
        toneRules: parsed.toneRules || DEFAULT_KOLIA_VOICE.toneRules,
        createdAt: new Date().toISOString(),
      };

      await saveBrandVoice(profile);
      return profile;
    }
  } catch (error) {
    console.warn("[brand-voice] AI learning failed:", error);
  }

  return DEFAULT_KOLIA_VOICE;
}

/**
 * Apply brand voice into content generation prompt
 */
export function applyBrandVoicePrompt(profile: BrandVoiceProfile, platform: string): string {
  const platformRules = profile.toneRules.find((r) => r.platform === platform);

  return [
    `## Brand Voice: ${profile.name}`,
    ``,
    profile.description,
    ``,
    "### Đặc điểm giọng văn:",
    ...profile.traits.map((t) => `- ${t}`),
    ``,
    "### Nguyên tắc:",
    ...profile.avoid.map((a) => `- ⛔ ${a}`),
    ``,
    platformRules
      ? [`### Quy tắc cho ${platform}:`, ...platformRules.rules.map((r) => `- ${r}`)].join("\n")
      : "",
    ``,
    profile.samplePosts.length > 0
      ? [`### Bài viết tham khảo (giọng văn mẫu):`, ...profile.samplePosts.map((s) => `- ${s}`)].join("\n")
      : "",
  ].join("\n");
}
