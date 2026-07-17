import { prisma } from "../config/db.js";
import { AppFormData, generateWebsiteData } from "./ai.service.js";

const GENERATION_COSTS: Record<AppFormData["Complexity"], number> = {
  Minimal: 25,
  Low: 50,
  Medium: 75,
  High: 100,
};

interface GetHistoryParams {
  userId: string;
  page: number;
  limit: number;
  language?: string;
  complexity?: string;
  sort?: "new" | "old";
  search?: string;
}

export const generateService = {
  async generate(formData: AppFormData, userId: string) {
    const generationCost = GENERATION_COSTS[formData.Complexity];

    if (generationCost === undefined) {
      throw new Error("Invalid complexity");
    }

    const balance = await prisma.userBalance.findUnique({
      where: { userId },
    });

    if (!balance || balance.balance < generationCost) {
      throw new Error("Insufficient balance");
    }

    const result = await generateWebsiteData(formData);

    await prisma.$transaction([
      prisma.gemeniResponse.create({
        data: {
          userId,
          projectName: formData.ProjectName,
          description: formData.Description,
          language: formData.Language,
          complexity: formData.Complexity,
          colorPalette: formData.ColorPalette,
          html: result.html,
        },
      }),

      prisma.userBalance.update({
        where: { userId },
        data: {
          balance: {
            decrement: generationCost,
          },
        },
      }),
    ]);

    return {
      ...result,
      generationCost,
    };
  },

  async getGenerateHistory(historyData: GetHistoryParams) {
    const {
      userId,
      page,
      limit,
      language,
      complexity,
      sort = "new",
      search,
    } = historyData;

    const where = {
      userId,
      ...(language && { language }),
      ...(complexity && { complexity }),
      ...(search && {
        OR: [
          {
            projectName: {
              contains: search,
              mode: "insensitive" as const,
            },
          },
          {
            description: {
              contains: search,
              mode: "insensitive" as const,
            },
          },
        ],
      }),
    };

    const totalProjects = await prisma.gemeniResponse.count({
      where: {
        userId,
      },
    });

    const totalCount = await prisma.gemeniResponse.count({
      where,
    });

    const history = await prisma.gemeniResponse.findMany({
      where,

      orderBy: {
        createdAt: sort === "old" ? "asc" : "desc",
      },

      skip: (page - 1) * limit,
      take: limit,

      select: {
        id: true,
        projectName: true,
        description: true,
        language: true,
        complexity: true,
        colorPalette: true,
        html: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      projects: history,

      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        totalProjects,
      },
    };
  },
};