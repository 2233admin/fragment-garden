import { expect, type Page } from "@playwright/test";

export type CompanionChoice = "cat" | "dog";

const COMPANION_LABELS: Readonly<Record<CompanionChoice, string>> = {
  cat: "猫",
  dog: "狗",
};

export async function completeCompanionOnboardingIfNeeded(
  page: Page,
  companionType: CompanionChoice = "cat",
): Promise<void> {
  const onboardingDialog = page.getByRole("dialog", {
    name: "选择一位陪你照看花园的伙伴",
  });
  const companionButton = page.getByRole("button", {
    name: "打开花园伙伴",
    exact: true,
  });

  await expect
    .poll(async () => (await onboardingDialog.isVisible()) || (await companionButton.isVisible()), {
      message: "等待本地伙伴设置读取完成",
    })
    .toBe(true);

  if (await onboardingDialog.isVisible()) {
    await onboardingDialog
      .getByRole("button", {
        name: `选择${COMPANION_LABELS[companionType]}`,
        exact: true,
      })
      .click();
    await expect(onboardingDialog).toBeHidden();
  }

  await expect(companionButton).toBeVisible();
}

export async function expectSingleCompanion(
  page: Page,
  companionType: CompanionChoice,
): Promise<void> {
  const gardenHost = page.getByTestId("garden-canvas-host");

  await expect(gardenHost).toHaveAttribute("data-companion-count", "1");
  await expect(gardenHost).toHaveAttribute("data-companion-type", companionType);
  await expect(gardenHost).toHaveAttribute("aria-busy", "false");
}
