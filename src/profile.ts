export interface WorkerProfile {
  email: string;
  phone: string;
  resumePath?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  country?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
}

export function loadWorkerProfileFromEnv(): WorkerProfile {
  const firstName = process.env.AUTO_APPLY_FIRST_NAME?.trim();
  const lastName = process.env.AUTO_APPLY_LAST_NAME?.trim();
  const fullName = process.env.AUTO_APPLY_FULL_NAME?.trim() || [firstName, lastName].filter(Boolean).join(" ") || undefined;

  return {
    email: process.env.AUTO_APPLY_EMAIL ?? "your@email.com",
    phone: process.env.AUTO_APPLY_PHONE ?? "+1234567890",
    resumePath: process.env.AUTO_APPLY_RESUME_PATH,
    firstName,
    lastName,
    fullName,
    country: process.env.AUTO_APPLY_COUNTRY?.trim(),
    linkedinUrl: process.env.AUTO_APPLY_LINKEDIN_URL?.trim(),
    githubUrl: process.env.AUTO_APPLY_GITHUB_URL?.trim(),
    portfolioUrl: process.env.AUTO_APPLY_PORTFOLIO_URL?.trim(),
  };
}
