import type { CompanionType } from "@/domain";

export type CompanionMarkProps = {
  companionType: CompanionType;
  size?: "small" | "medium" | "large";
};

const SIZE_CLASSES: Readonly<Record<NonNullable<CompanionMarkProps["size"]>, string>> = {
  small: "size-8",
  medium: "size-12",
  large: "size-20",
};

const COLOR_CLASSES: Readonly<Record<CompanionType, string>> = {
  cat: "text-garden-accent",
  dog: "text-garden-muted",
};

export function CompanionMark({ companionType, size = "medium" }: CompanionMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 ${SIZE_CLASSES[size]} ${COLOR_CLASSES[companionType]}`}
      data-companion-type={companionType}
    >
      <svg fill="none" viewBox="0 0 64 64">
        {companionType === "cat" ? (
          <path
            d="M18.5 18.5 14 7.5 26 14m19.5 4.5L50 7.5 38 14"
            fill="currentColor"
            fillOpacity=".16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ) : (
          <path
            d="M19 17c-5.5-5-11.5-4-12.5 1.5C5.8 22.8 9.2 27 15 28m30-11c5.5-5 11.5-4 12.5 1.5.7 4.3-2.7 8.5-8.5 9.5"
            fill="currentColor"
            fillOpacity=".16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        )}
        <path
          d="M32 12.5c-12 0-21 8.6-21 20.2 0 10.2 7.1 18 17.1 19.8L34 58l2.3-5.4C46 50.7 53 43 53 32.7c0-11.6-9-20.2-21-20.2Z"
          fill="currentColor"
          fillOpacity=".12"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <circle cx="24" cy="32" fill="currentColor" r="2.2" />
        <circle cx="40" cy="32" fill="currentColor" r="2.2" />
        <path
          d="M27 40c1.5 1.3 3.2 2 5 2s3.5-.7 5-2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>
    </span>
  );
}
