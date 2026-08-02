"use client";

import { useId } from "react";

import type { CompanionType } from "@/domain";

import { ModalDialog } from "../shared/ModalDialog";
import { CompanionMark } from "./CompanionMark";

export type CompanionOnboardingDialogProps = {
  errorMessage: string | null;
  isOpen: boolean;
  isPending: boolean;
  onChoose: (companionType: CompanionType) => void;
};

const COMPANION_OPTIONS: readonly CompanionType[] = ["cat", "dog"];

const COMPANION_LABELS: Readonly<Record<CompanionType, string>> = {
  cat: "猫",
  dog: "狗",
};

function ignoreCloseRequest(): void {
  // Onboarding is a required, one-time choice and has no skip path.
}

export function CompanionOnboardingDialog({
  errorMessage,
  isOpen,
  isPending,
  onChoose,
}: CompanionOnboardingDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalDialog
      className="m-auto w-[min(92vw,46rem)] rounded-3xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={ignoreCloseRequest}
    >
      <div aria-busy={isPending}>
        <header className="border-b border-garden-line px-6 py-6 text-center sm:px-10 sm:py-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-garden-accent uppercase">
            花园初见
          </p>
          <h2
            className="mx-auto mt-2 max-w-xl font-display text-2xl leading-tight font-semibold text-garden-ink sm:text-3xl"
            id={titleId}
          >
            选择一位陪你照看花园的伙伴
          </h2>
          <p
            className="mx-auto mt-3 max-w-lg text-sm leading-6 text-garden-muted"
            id={descriptionId}
          >
            猫和狗拥有相同的功能，只是外观不同。选择会保存在当前浏览器中。
          </p>
        </header>

        <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 sm:px-10 sm:py-8">
          {COMPANION_OPTIONS.map((companionType) => {
            const label = COMPANION_LABELS[companionType];

            return (
              <section
                className="flex flex-col items-center rounded-2xl border border-garden-line bg-garden-canvas/45 px-5 py-6 text-center"
                key={companionType}
              >
                <CompanionMark companionType={companionType} size="large" />
                <h3 className="mt-4 font-display text-2xl font-semibold text-garden-ink">
                  {label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-garden-muted">功能相同，仅外观不同。</p>
                <button
                  aria-busy={isPending}
                  className="mt-5 w-full rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:cursor-wait disabled:opacity-60"
                  disabled={isPending}
                  onClick={() => onChoose(companionType)}
                  type="button"
                >
                  选择{label}
                </button>
              </section>
            );
          })}
        </div>

        <div
          aria-atomic="true"
          aria-live={errorMessage === null ? "polite" : "assertive"}
          className="min-h-14 border-t border-garden-line px-6 py-4 text-center text-sm sm:px-10"
          role={errorMessage === null ? "status" : "alert"}
        >
          {errorMessage !== null ? (
            <p className="font-semibold leading-6 text-garden-danger">
              {errorMessage} 你的花园数据没有被修改，可以重新选择。
            </p>
          ) : isPending ? (
            <p className="font-semibold leading-6 text-garden-accent">正在保存伙伴选择…</p>
          ) : (
            <p className="leading-6 text-garden-muted">选择完成前，这个窗口不会关闭或跳过。</p>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
