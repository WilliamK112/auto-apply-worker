import type { Page } from "playwright";
import { detectCaptcha } from "../captcha";

export interface GreenhouseProfileData {
  email?: string;
  phone?: string;
  resumePath?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  country?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
}

export interface GreenhouseFillResult {
  success: boolean;
  errorMessage?: string;
  captchaDetected: boolean;
  captchaType?: string;
  submitted: boolean;
  applicationUrl?: string;
}

async function fillIfVisible(page: Page, selectors: string[], value: string | undefined): Promise<boolean> {
  if (!value) return false;
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    if (await field.count().catch(() => 0)) {
      const visible = await field.isVisible().catch(() => false);
      if (!visible) continue;
      await field.click({ clickCount: 3 }).catch(() => {});
      await field.fill(value).catch(() => {});
      return true;
    }
  }
  return false;
}

async function selectIfVisible(page: Page, selectors: string[], value: string | undefined): Promise<boolean> {
  if (!value) return false;
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    if (await field.count().catch(() => 0)) {
      const visible = await field.isVisible().catch(() => false);
      if (!visible) continue;
      try {
        await field.selectOption({ label: value });
        return true;
      } catch {}
      try {
        await field.selectOption({ value: value });
        return true;
      } catch {}
    }
  }
  return false;
}

export async function fillAndSubmitGreenhouseApplication(
  page: Page,
  profile: GreenhouseProfileData,
): Promise<GreenhouseFillResult> {
  try {
    const quickApplyButton = page.locator('a[href*="#app"], a[href*="#application"], button:has-text("Apply"), a:has-text("Apply")').first();
    if (await quickApplyButton.count().catch(() => 0)) {
      await quickApplyButton.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    await page.waitForSelector('form, #application_form, [data-qa="application-form"]', { timeout: 10000 }).catch(() => null);

    const formVisible = await page.locator('form').first().isVisible().catch(() => false);
    if (!formVisible) {
      return {
        success: false,
        captchaDetected: false,
        submitted: false,
        errorMessage: 'Greenhouse application form not detected',
      };
    }

    await fillIfVisible(page, [
      'input[name="first_name"]',
      'input[id="first_name"]',
      'input[autocomplete="given-name"]',
    ], profile.firstName);

    await fillIfVisible(page, [
      'input[name="last_name"]',
      'input[id="last_name"]',
      'input[autocomplete="family-name"]',
    ], profile.lastName);

    await fillIfVisible(page, [
      'input[name="name"]',
      'input[id="name"]',
      'input[name="full_name"]',
    ], profile.fullName);

    await fillIfVisible(page, [
      'input[name="email"]',
      'input[type="email"]',
      'input[id="email"]',
    ], profile.email);

    await fillIfVisible(page, [
      'input[name="phone"]',
      'input[type="tel"]',
      'input[id="phone"]',
    ], profile.phone);

    await selectIfVisible(page, [
      'select[name="country"]',
      'select[id="country"]',
      'select[name*="country"]',
    ], profile.country);

    await fillIfVisible(page, [
      'input[name="linkedin"]',
      'input[name*="linkedin"]',
      'input[id*="linkedin"]',
    ], profile.linkedinUrl);

    await fillIfVisible(page, [
      'input[name="github"]',
      'input[name*="github"]',
      'input[id*="github"]',
    ], profile.githubUrl);

    await fillIfVisible(page, [
      'input[name="portfolio"]',
      'input[name*="portfolio"]',
      'input[name*="website"]',
      'input[id*="portfolio"]',
      'input[id*="website"]',
    ], profile.portfolioUrl);

    if (profile.resumePath) {
      const resumeInput = page.locator('input[type="file"][name*="resume"], input[type="file"]').first();
      if (await resumeInput.count().catch(() => 0)) {
        const visible = await resumeInput.isVisible().catch(() => false);
        if (visible) {
          await resumeInput.setInputFiles(profile.resumePath).catch(() => {});
          await page.waitForTimeout(1000);
        }
      }
    }

    const requiredEmptyFields = await page.locator('input[required], textarea[required], select[required]').evaluateAll((elements) => {
      return elements
        .filter((el) => {
          const style = (globalThis as any).getComputedStyle(el as any);
          return style.display !== 'none' && style.visibility !== 'hidden';
        })
        .filter((el: any) => {
          const type = (el.type || '').toLowerCase();
          if (type === 'file') return !(el.files && el.files.length > 0);
          if (type === 'checkbox' || type === 'radio') return !el.checked;
          return !el.value;
        })
        .map((el: any) => el.getAttribute('name') || el.getAttribute('id') || el.getAttribute('aria-label') || el.tagName)
        .slice(0, 10);
    });

    if (requiredEmptyFields.length > 0) {
      return {
        success: false,
        captchaDetected: false,
        submitted: false,
        errorMessage: `Greenhouse still has required fields needing manual input: ${requiredEmptyFields.join(', ')}`,
      };
    }

    const submitButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Submit Application")').first();
    if (!(await submitButton.count().catch(() => 0))) {
      return {
        success: false,
        captchaDetected: false,
        submitted: false,
        errorMessage: 'Greenhouse submit button not found',
      };
    }

    const disabled = await submitButton.isDisabled().catch(() => false);
    if (disabled) {
      const captchaBeforeSubmit = await detectCaptcha(page);
      if (captchaBeforeSubmit.found) {
        return {
          success: false,
          captchaDetected: true,
          captchaType: captchaBeforeSubmit.type,
          submitted: false,
          errorMessage: captchaBeforeSubmit.description,
        };
      }
      return {
        success: false,
        captchaDetected: false,
        submitted: false,
        errorMessage: 'Greenhouse submit button is disabled',
      };
    }

    await submitButton.click().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);

    const captchaAfterSubmit = await detectCaptcha(page);
    if (captchaAfterSubmit.found) {
      return {
        success: false,
        captchaDetected: true,
        captchaType: captchaAfterSubmit.type,
        submitted: false,
        errorMessage: captchaAfterSubmit.description,
      };
    }

    const finalUrl = page.url();
    const successSignal = await page.locator('body').evaluate((body: any) => {
      const text = (body?.innerText || '').toLowerCase();
      return text.includes('application submitted') || text.includes('thank you for applying') || text.includes('we have received your application');
    }).catch(() => false);

    return {
      success: successSignal,
      captchaDetected: false,
      submitted: successSignal,
      applicationUrl: finalUrl,
      errorMessage: successSignal ? undefined : 'Greenhouse submit attempted but confirmation not detected',
    };
  } catch (err) {
    return {
      success: false,
      captchaDetected: false,
      submitted: false,
      errorMessage: err instanceof Error ? err.message : 'Unknown Greenhouse submission error',
    };
  }
}
