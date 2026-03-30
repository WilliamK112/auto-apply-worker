import type { Page } from "playwright";

export type CaptchaType =
  | "recaptcha_v2_checkbox"
  | "recaptcha_v2_images"
  | "hcaptcha"
  | "image_captcha"
  | "challenge_v2"
  | "none";

export interface CaptchaDetection {
  type: CaptchaType;
  found: boolean;
  description: string;
  suggestedAction: "human-in-the-loop" | "skip" | "continue";
}

/**
 * Detect if the current page has a CAPTCHA blocking form submission.
 * Called after the page is fully loaded and before we try to fill/submit.
 */
export async function detectCaptcha(page: Page): Promise<CaptchaDetection> {
  const pageContent = page.url();

  // 1. reCAPTCHA v2 checkbox (most common on LinkedIn/Indeed)
  const recaptchaCheckbox = await page.$(
    '.g-recaptcha, iframe[src*="recaptcha"], .recaptcha-checkbox, [id*="recaptcha"]',
  );
  if (recaptchaCheckbox) {
    const isVisible = await recaptchaCheckbox.isVisible().catch(() => false);
    if (isVisible) {
      return {
        type: "recaptcha_v2_checkbox",
        found: true,
        description: "reCAPTCHA v2 checkbox detected — user must click 'I'm not a robot'",
        suggestedAction: "human-in-the-loop",
      };
    }
  }

  // 2. reCAPTCHA image challenge (appears after checkbox click)
  const recaptchaImages = await page.$(
    'iframe[src*="recaptcha"] ~ *, .rc-imageselect, [class*="rc-imageselect"]',
  );
  if (recaptchaImages) {
    const isVisible = await recaptchaImages.isVisible().catch(() => false);
    if (isVisible) {
      return {
        type: "recaptcha_v2_images",
        found: true,
        description: "reCAPTCHA image challenge detected — user must select matching images",
        suggestedAction: "human-in-the-loop",
      };
    }
  }

  // 3. hCaptcha
  const hcaptcha = await page.$(
    '.h-captcha, iframe[src*="hcaptcha"], [data-sitekey]',
  );
  if (hcaptcha) {
    const isVisible = await hcaptcha.isVisible().catch(() => false);
    if (isVisible) {
      return {
        type: "hcaptcha",
        found: true,
        description: "hCaptcha detected — user must complete hCaptcha challenge",
        suggestedAction: "human-in-the-loop",
      };
    }
  }

  // 4. Simple image/text CAPTCHA (common on Indeed after multiple applications)
  const imageCaptcha = await page.$(
    'img[src*="captcha"], input[name*="captcha"], [class*="captcha"]',
  );
  if (imageCaptcha) {
    const isVisible = await imageCaptcha.isVisible().catch(() => false);
    if (isVisible) {
      return {
        type: "image_captcha",
        found: true,
        description: "Image/text CAPTCHA detected — user must solve manually",
        suggestedAction: "human-in-the-loop",
      };
    }
  }

  // 5. LinkedIn challenge page (e.g., "We're verifying you're a person")
  if (pageContent.includes("linkedin.com/challenge")) {
    return {
      type: "challenge_v2",
      found: true,
      description: "LinkedIn verification challenge page — user must complete in browser",
      suggestedAction: "human-in-the-loop",
    };
  }

  return {
    type: "none",
    found: false,
    description: "No CAPTCHA detected",
    suggestedAction: "continue",
  };
}

/**
 * Check if the form is submittable — no CAPTCHA, all required fields filled.
 */
export async function isFormSubmittable(page: Page): Promise<boolean> {
  // Look for common "submit" buttons
  const submitButton = await page.$(
    'button[type="submit"], input[type="submit"], [aria-label*="submit" i], [data-control-name*="submit"]',
  );
  if (!submitButton) return false;

  const isDisabled = await submitButton.isDisabled().catch(() => false);
  return !isDisabled;
}
