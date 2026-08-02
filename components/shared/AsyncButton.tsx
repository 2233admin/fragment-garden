import type { ButtonHTMLAttributes, ReactNode } from "react";

type AsyncButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children: ReactNode;
  isPending: boolean;
  pendingLabel: string;
};

export function AsyncButton({
  children,
  disabled,
  isPending,
  pendingLabel,
  ...buttonProps
}: AsyncButtonProps) {
  return (
    <button {...buttonProps} aria-busy={isPending} disabled={disabled || isPending}>
      {isPending ? pendingLabel : children}
    </button>
  );
}
