import type { CreateResumeHtmlRequest, ResumeQualityWarning } from "@career/contracts/types";

function hasValidPortfolioLink(value: string): boolean {
  return /https?:\/\/\S+/i.test(value) || /(?:^|\s)(?:github|gitee)\.com\/[\w.-]+/i.test(value);
}

function parseYearMonth(value: string): { year: number; month: number } | null {
  const match = value.match(/(20\d{2}|19\d{2})[./-](0?[1-9]|1[0-2])/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

function monthDistance(
  start: { year: number; month: number },
  end: { year: number; month: number },
) {
  return (end.year - start.year) * 12 + (end.month - start.month);
}

function hasOddUndergraduatePeriod(input: CreateResumeHtmlRequest): boolean {
  return input.educations.some((education) => {
    if (!/本科/.test(education.degree)) return false;
    const matches = education.period.match(/(20\d{2}|19\d{2})[./-](0?[1-9]|1[0-2])/g);
    if (!matches || matches.length < 2) return false;

    const start = parseYearMonth(matches[0]);
    const end = parseYearMonth(matches[1]);
    if (!start || !end) return false;

    return monthDistance(start, end) > 0 && monthDistance(start, end) < 30;
  });
}

function hasTargetRoleMismatch(input: CreateResumeHtmlRequest): boolean {
  if (!/java/i.test(input.basic.target_position)) return false;
  if (input.experiences.length === 0) return false;

  const experienceText = input.experiences
    .map((item) =>
      [
        item.organization,
        item.role,
        item.background,
        item.tech_stack,
        item.responsibilities,
        item.achievements,
        item.difficulties,
      ].join("\n"),
    )
    .join("\n");

  return !/java|spring|spring\s*boot|mybatis|jvm/i.test(experienceText);
}

export function buildResumeQualityWarnings(input: CreateResumeHtmlRequest): ResumeQualityWarning[] {
  const warnings: ResumeQualityWarning[] = [];

  if (input.experiences.length === 0) {
    warnings.push({
      code: "NO_EXPERIENCE",
      message: "当前没有填写项目、实习或竞赛经历，简历会偏薄，建议补充至少一段能证明能力的经历。",
    });
  }

  if (hasOddUndergraduatePeriod(input)) {
    warnings.push({
      code: "ODD_EDUCATION_PERIOD",
      message: "本科教育时间看起来偏短，请确认是否填写了完整起止时间。",
    });
  }

  if (input.portfolio_links && !hasValidPortfolioLink(input.portfolio_links)) {
    warnings.push({
      code: "INVALID_PORTFOLIO_LINK",
      message: "作品链接不像完整网址，建议填写 GitHub、演示地址或作品集的完整 URL。",
    });
  }

  if (hasTargetRoleMismatch(input)) {
    warnings.push({
      code: "TARGET_ROLE_MISMATCH",
      message:
        "目标岗位偏 Java，但项目经历中缺少 Java/Spring 等后端证据，建议补充相关项目或调整目标岗位。",
    });
  }

  return warnings;
}
